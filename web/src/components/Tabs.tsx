import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./icons/Icon";
import type { IconName } from "./icons/iconData";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
  children: ReactNode;
}

/** WAI-ARIA tabs with arrow-key navigation. */
export function Tabs<T extends string>({ tabs, active, onChange, label, children }: Props<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].id);
      refs.current[next]?.focus();
    }
  }

  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tablist">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${id}-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${id}-panel`}
            tabIndex={t.id === active ? 0 : -1}
            className={t.id === active ? "tab active" : "tab"}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.icon && <Icon name={t.icon} size={18} />}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} className="tabpanel" tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
