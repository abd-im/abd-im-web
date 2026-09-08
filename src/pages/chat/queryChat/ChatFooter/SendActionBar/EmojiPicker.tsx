import { Input } from "antd";
import { FC, useEffect, useState } from "react";

interface EmojiItem {
  emoji: string;
  annotation: string;
}

const loadEmojiData = (signal: AbortSignal) => {
  const emojiDataUrl = new URL("emojis.json", document.baseURI);

  if (emojiDataUrl.protocol !== "file:") {
    return fetch(emojiDataUrl, { signal }).then((response) => {
      if (!response.ok) throw new Error("Unable to load emoji data");
      return response.json() as Promise<EmojiItem[]>;
    });
  }

  return new Promise<EmojiItem[]>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", emojiDataUrl.href);
    request.onload = () => {
      try {
        resolve(JSON.parse(request.responseText) as EmojiItem[]);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("Unable to load emoji data"));
    signal.addEventListener("abort", () => request.abort(), { once: true });
    request.send();
  });
};

const EmojiPicker: FC<{ onSelect: (emoji: string) => void }> = ({ onSelect }) => {
  const [emojis, setEmojis] = useState<EmojiItem[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void loadEmojiData(controller.signal)
      .then(setEmojis)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error(error);
      });
    return () => controller.abort();
  }, []);

  const filteredEmojis = emojis
    .filter((e) => e.annotation.includes(filter) || e.emoji.includes(filter))
    .slice(0, 100);

  return (
    <div className="w-[300px] rounded-md border border-gray-200 bg-white p-2 shadow-lg">
      <Input
        placeholder="Search emojis..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-2"
        size="small"
      />
      <div className="no-scrollbar grid h-[200px] grid-cols-8 gap-1 overflow-y-auto">
        {filteredEmojis.map((e, i) => (
          <div
            key={`${e.emoji}-${i}`}
            className="flex cursor-pointer items-center justify-center rounded p-1 text-xl hover:bg-gray-100"
            style={{
              fontFamily:
                '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
            }}
            title={e.annotation}
            onClick={() => onSelect(e.emoji)}
          >
            {e.emoji}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmojiPicker;
