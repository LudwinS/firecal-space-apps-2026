import { useId, useState } from "react";
import { t } from "../i18n";

interface Props {
  /** One-line explanation shown in the bubble. */
  text: string;
  /** The term being explained, used in the button's accessible name ("What is Harmonized?"). */
  term?: string;
  /** Side of the button the bubble grows toward; use "end" near the right edge of a card. */
  align?: "start" | "end";
}

/**
 * Small (i) button that explains a technical term in one line.
 * The bubble shows on hover and on keyboard focus (CSS), and toggles on click or tap;
 * Escape or leaving the button closes it. Screen readers get the text through aria-describedby.
 */
export function InfoTip({ text, term, align = "start" }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className={`infotip infotip-${align}${open ? " open" : ""}`}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={term ? t("What is {term}?", { term }) : t("More information")}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span role="tooltip" id={id} className="infotip-bubble">
        {text}
      </span>
    </span>
  );
}
