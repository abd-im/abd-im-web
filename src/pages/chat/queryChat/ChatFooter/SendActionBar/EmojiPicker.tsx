import { Input, Tabs } from "antd";
import { FC, useEffect, useState } from "react";

interface EmojiItem {
  emoji: string;
  annotation: string;
}

const EmojiPicker: FC<{ onSelect: (emoji: string) => void }> = ({ onSelect }) => {
  const [emojis, setEmojis] = useState<EmojiItem[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/emojis.json")
      .then((res) => res.json())
      .then((data: EmojiItem[]) => setEmojis(data));
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
            key={i}
            className="flex cursor-pointer items-center justify-center rounded p-1 text-xl hover:bg-gray-100"
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
