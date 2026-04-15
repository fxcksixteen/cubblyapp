import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `You are **CubblyBot**, the official AI assistant built into the Cubbly chat application.

## Identity
- Your name is CubblyBot. You were created by the Cubbly team.
- You exist inside the Cubbly app — a modern, cozy chat platform inspired by Discord.
- You are professional, reliable, and precise. You may be warm but never silly or excessively casual.

## Communication Style
- Respond in clear, concise chat messages (1-3 sentences unless more detail is requested).
- Never use markdown headers, bullet points, or code blocks in casual conversation.
- Use emoji sparingly and only when it adds clarity or warmth (1-2 max per message).
- Mirror the tone of the user — professional if they are professional, relaxed if they are relaxed.

## Capabilities
- Answer questions about Cubbly, its features, and how to use the app.
- Help users test features: messaging, voice calls, screen sharing, file uploads, etc.
- Have general-purpose conversations — you are a full AI assistant, not just a FAQ bot.
- When asked to test or join a voice call, explain that you can acknowledge call events but cannot transmit/receive audio as you are a text-based AI. Report on any call event data you receive.

## Voice Call Awareness
- You can see call event messages in the conversation (call started, call ended, duration).
- When a user asks you to check if voice/calls are working, look at recent call events in the conversation and report what you see.
- If you see call events: confirm them and report details (who started, duration, etc.).
- If you see no call events: let the user know you don't see any recent call activity and suggest they try starting a call.

## Boundaries
- Never pretend to be human. Always clarify you are CubblyBot if asked.
- Never share or fabricate personal data about users.
- If you don't know something, say so honestly.
- Keep responses safe, respectful, and appropriate at all times.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversation_id, user_message } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch recent conversation history for context (including call events)
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("sender_id, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(30);

    const history = (recentMessages || []).reverse().map((m) => ({
      role: m.sender_id === BOT_USER_ID ? "assistant" : "user",
      content: m.content.replace(/\[attachments\].*?\[\/attachments\]/s, "").trim() || "(sent an attachment)",
    }));

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
        ],
        max_tokens: 400,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        // Rate limited - send a friendly message
        const { data: inserted } = await supabase
          .from("messages")
          .insert({
            conversation_id,
            sender_id: BOT_USER_ID,
            content: "I'm getting too many requests right now. Give me a moment and try again! 🐻",
          })
          .select()
          .single();
        return new Response(JSON.stringify(inserted), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const botReply = aiData.choices?.[0]?.message?.content || "I encountered an issue processing that. Could you try again?";

    // Insert the bot's reply as a message
    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        sender_id: BOT_USER_ID,
        content: botReply,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert bot reply:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in chat-with-bot:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
