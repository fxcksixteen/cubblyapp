import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `You are CubblyBot, a friendly and helpful AI assistant built into the Cubbly chat app. You're warm, conversational, and a bit playful — like a cozy companion. Keep responses concise and natural like a chat message (1-3 sentences usually). Use casual language. You can use emoji sparingly. You help users test features, answer questions, and have fun conversations. Never use markdown headers or bullet points — just chat naturally.`;

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

    // Fetch recent conversation history for context
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("sender_id, content, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(20);

    const history = (recentMessages || []).reverse().map((m) => ({
      role: m.sender_id === BOT_USER_ID ? "assistant" : "user",
      content: m.content.replace(/\[attachments\].*?\[\/attachments\]/s, "").trim() || "(sent an attachment)",
    }));

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
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
        max_tokens: 300,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", errText);
      throw new Error(`AI Gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const botReply = aiData.choices?.[0]?.message?.content || "Hey! I'm having a moment, try again? 🐻";

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
