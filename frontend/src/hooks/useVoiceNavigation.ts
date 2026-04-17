import { useCallback, useEffect, useMemo, useState } from 'react';

export interface VoiceNavigationControls {
  speak: (text: string, interrupt?: boolean) => void;
  isSpeaking: boolean;
  voiceEnabled: boolean;
  setVoiceEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  supportsSpeech: boolean;
}

export function useVoiceNavigation(): VoiceNavigationControls {
  const supportsSpeech = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
  }, []);

  const [voiceEnabled, setVoiceEnabled] = useState(supportsSpeech);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback(
    (text: string, interrupt = false) => {
      if (!supportsSpeech || !voiceEnabled || !text.trim()) {
        return;
      }

      if (interrupt) {
        window.speechSynthesis.cancel();
      }

      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [supportsSpeech, voiceEnabled],
  );

  useEffect(() => {
    if (!supportsSpeech) {
      return;
    }

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [supportsSpeech]);

  return {
    speak,
    isSpeaking,
    voiceEnabled,
    setVoiceEnabled,
    supportsSpeech,
  };
}
