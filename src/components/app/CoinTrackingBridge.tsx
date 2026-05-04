import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useActivity } from "@/contexts/ActivityContext";
import { useCoins } from "@/contexts/CoinsContext";
import { isSoftwareActivity } from "@/lib/activityLabel";

/**
 * Headless bridge that wires VoiceContext + ActivityContext into the
 * CoinsContext heartbeat. Lives at the bottom of the provider tree so it
 * has access to all three.
 *
 * - Voice flag is true whenever the user is connected in an active call.
 * - Gaming flag is true ONLY when the detected activity is a real game
 *   (not software like Steam/Discord). Per the spec: must be PLAYING, not USING.
 */
export default function CoinTrackingBridge() {
  const { user } = useAuth();
  const { activeCall } = useVoice();
  const { activities } = useActivity();
  const { setVoiceActive, setGamingActive } = useCoins();

  // Voice: counted while we're actually connected to a call (not ringing/ended).
  useEffect(() => {
    const inCall = !!activeCall && activeCall.state === "connected";
    setVoiceActive(inCall);
  }, [activeCall, setVoiceActive]);

  // Gaming: only counted when our own activity is a real game.
  useEffect(() => {
    if (!user) {
      setGamingActive(false);
      return;
    }
    const mine = activities.get(user.id);
    const playingGame = !!mine && !isSoftwareActivity(mine);
    setGamingActive(playingGame);
  }, [user, activities, setGamingActive]);

  return null;
}
