import type { ComponentV2 } from "@abd-im/wasm-client-sdk";
import { Check, ChevronDown, ExternalLink, ShoppingBag } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Popover } from "@/components/ui";
import styles from "./v2-message.module.scss";

type SelectOption = NonNullable<ComponentV2["options"]>[number];

// The development preview supplies local actions. Live messages stay disabled
// until an authenticated interaction API and entity lookup are connected.
export const V2InteractionContext = createContext<{
  onAction: (messageID: string, component: ComponentV2, values: string[]) => void;
  options: Partial<Record<number, SelectOption[]>>;
} | null>(null);

export function V2Button({
  component,
  messageID,
}: {
  component: ComponentV2;
  messageID: string;
}) {
  const interaction = useContext(V2InteractionContext);
  const { t } = useTranslation();
  const label = (
    <>
      {component.emoji?.name && <span>{component.emoji.name}</span>}
      {component.label || (component.style === 6 ? t("messageComponents.premium") : "")}
    </>
  );
  if (
    component.style === 5 &&
    !component.disabled &&
    component.url &&
    /^https?:\/\//i.test(component.url)
  ) {
    return (
      <Button asChild className={styles.button} data-button-style="5">
        <a href={component.url} target="_blank" rel="noopener noreferrer">
          {label}
          <ExternalLink size={14} />
        </a>
      </Button>
    );
  }
  return (
    <Button
      className={styles.button}
      data-button-style={component.style}
      disabled={
        component.disabled ||
        component.style === 6 ||
        !component.custom_id ||
        !interaction
      }
      title={!interaction ? t("messageComponents.notConnected") : undefined}
      onClick={() => interaction?.onAction(messageID, component, [])}
    >
      {component.style === 6 && <ShoppingBag size={14} />}
      {label}
    </Button>
  );
}

export function V2Select({
  component,
  messageID,
}: {
  component: ComponentV2;
  messageID: string;
}) {
  const interaction = useContext(V2InteractionContext);
  const { t } = useTranslation();
  const options =
    component.type === 3
      ? component.options || []
      : interaction?.options[component.type] || [];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>(
    () =>
      component.default_values?.map((value) => value.id) ||
      options.filter((option) => option.default).map((option) => option.value),
  );
  const max = component.max_values ?? 1;
  const min = component.min_values ?? 1;
  const placeholder = component.placeholder || t("messageComponents.select");
  const disabled = component.disabled || !component.custom_id || !interaction;
  const selectedLabel = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label)
    .join(", ");
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className={styles.selectMenu}
      trigger={
        <Button
          className={styles.selectTrigger}
          disabled={disabled}
          aria-label={placeholder}
          title={!interaction ? t("messageComponents.notConnected") : undefined}
        >
          <span className={styles.selectLabel}>{selectedLabel || placeholder}</span>
          <ChevronDown size={16} />
        </Button>
      }
    >
      <div
        role="listbox"
        aria-label={placeholder}
        aria-multiselectable={max > 1}
        className="max-h-64 overflow-y-auto"
      >
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!selected && max > 1 && values.length >= max}
              className={styles.selectOption}
              onClick={() => {
                const next =
                  max === 1
                    ? selected && min === 0
                      ? []
                      : [option.value]
                    : selected
                    ? values.filter((value) => value !== option.value)
                    : [...values, option.value];
                setValues(next);
                if (max === 1) {
                  interaction?.onAction(messageID, component, next);
                  setOpen(false);
                }
              }}
            >
              <span className="w-4 shrink-0">{selected && <Check size={16} />}</span>
              {option.emoji?.name && <span>{option.emoji.name}</span>}
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                {option.description && (
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {(max > 1 || min === 0) && (
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <span className="text-xs text-muted-foreground">
            {values.length} / {max}
          </span>
          <Button
            size="small"
            disabled={values.length < min}
            onClick={() => {
              interaction?.onAction(messageID, component, values);
              setOpen(false);
            }}
          >
            {t("confirm")}
          </Button>
        </div>
      )}
    </Popover>
  );
}
