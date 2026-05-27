import { useState, useRef } from "react";
import { Mic, Send } from "lucide-react";

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function InputBar({ onSend, placeholder = "Ask Lancy anything…" }: Props) {
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const recognitionRef = useRef<any>(null);

  const voiceSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startRecording = () => {
    if (!voiceSupported) {
      setShowTip(true);
      setTimeout(() => setShowTip(false), 2000);
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript) {
        // Auto-send immediately on result
        onSend(transcript);
      }
      setRecording(false);
    };

    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setRecording(false);
  };

  const toggleRecord = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const submit = () => {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div className="bg-white border-t border-border relative">
      {recording && (
        <div className="absolute -top-12 left-0 right-0 flex flex-col items-center animate-fade-in pointer-events-none">
          <div className="bg-white border border-border rounded-full px-3 py-1.5 flex items-center gap-2 shadow-card">
            <div className="flex items-end gap-[3px] h-4">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="wave-bar w-[3px] h-full bg-accent rounded"
                  style={{ animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </div>
            <span className="text-[12px] text-muted-foreground">Listening… tap mic to stop</span>
          </div>
        </div>
      )}
      {showTip && (
        <div className="absolute -top-10 left-3 bg-foreground text-white text-[11px] rounded-md px-2 py-1 animate-fade-in">
          Microphone not supported on this browser
        </div>
      )}
      <div className="px-3 py-3 flex items-center gap-2">
        <button
          onClick={toggleRecord}
          aria-label="Voice input"
          className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 transition-all ${
            recording
              ? "bg-red-500 text-white scale-110 shadow-lg animate-pulse"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          <Mic size={18} />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder}
          className="flex-1 h-12 px-4 rounded-[22px] bg-secondary text-foreground placeholder:text-hint text-[14px] outline-none border-0"
        />
        <button
          onClick={submit}
          aria-label="Send"
          className="h-12 w-12 rounded-full bg-accent text-white flex items-center justify-center shrink-0 active:scale-95 transition"
        >
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}
