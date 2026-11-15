import { useState } from "react";
import { errorMessage, saveBlob } from "../api/client";
import { fileSlug } from "../api/requests";
import type { FireCalApi, QueryRequest } from "../api/types";
import { CsvIcon, ReportIcon } from "./icons/Icon";

interface Props {
  api: FireCalApi;
  query: QueryRequest | null;
  large?: boolean;
}

type Kind = "csv" | "pdf";

export function DownloadButtons({ api, query, large = false }: Props) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: Kind) {
    if (!query) return;
    setBusy(kind);
    setError(null);
    try {
      const blob = kind === "csv" ? await api.exportCsv(query) : await api.reportPdf(query);
      const stamp = new Date().toISOString().slice(0, 10);
      saveBlob(blob, `firecal_${fileSlug(query.area)}_${stamp}.${kind}`);
    } catch (e) {
      setError(`Download failed: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  // Como en el diseño: el informe PDF es la acción principal (Ember) y el CSV la secundaria (contorno Sand).
  const size = large ? " btn-lg" : "";
  return (
    <div className={large ? "downloads downloads-lg" : "downloads"}>
      <button type="button" className={`btn btn-primary${size}`} onClick={() => download("pdf")} disabled={!query || busy !== null} aria-busy={busy === "pdf"}>
        <ReportIcon size={large ? 22 : 18} /> {busy === "pdf" ? "Preparing report…" : "Download PDF report"}
      </button>
      <button type="button" className={`btn btn-outline${size}`} onClick={() => download("csv")} disabled={!query || busy !== null} aria-busy={busy === "csv"}>
        <CsvIcon size={large ? 22 : 18} /> {busy === "csv" ? "Preparing CSV…" : "Download hotspots CSV"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
