import { t, useLang } from "../i18n";
import type { FireCalApi } from "../api/types";
import { AsyncBlock } from "../components/AsyncBlock";
import { HarmonizeIcon, LevelNormalIcon, ValidationIcon } from "../components/icons/Icon";
import { fmtPct, prettyMethod } from "../lib/format";
import { useAsync } from "../hooks/useAsync";

export function MethodsPanel({ api, sourceKey }: { api: FireCalApi; sourceKey: string }) {
  const lang = useLang();
  const methods = useAsync(`methods:${sourceKey}`, () => api.methods());
  return (
    <div className="stack">
      <section className="panel prose">
        <h2 className="panel-title">
          <HarmonizeIcon size={22} className="title-icon" /> {t("How the harmonization works")}
        </h2>
        {lang === "es" ? (
          <>
            <p>
              La NASA ha observado los incendios desde el espacio con dos familias de sensores. <strong>MODIS</strong> (satélites Terra y
              Aqua, desde 2000) ve el suelo en píxeles de 1&nbsp;km. <strong>VIIRS</strong> (desde 2012) usa píxeles de 375&nbsp;m, así que
              detecta muchos más incendios pequeños. Si solo se apilaran sus conteos, cada año después de 2012 parecería una explosión de
              incendios que nunca ocurrió.
            </p>
            <ol>
              <li>
                <strong>Limpiar.</strong> Se conservan solo las detecciones confiables de incendios de vegetación y se retiran las fuentes
                de calor persistentes, como volcanes y sitios industriales.
              </li>
              <li>
                <strong>Aprender la relación.</strong> Desde 2012 ambos sensores observaron los mismos lugares al mismo tiempo. En una
                rejilla de 0.25° (~27&nbsp;km), mes a mes, comparamos seis métodos: una sola razón, una razón por mes del calendario, una
                razón por celda y mes ajustada hacia el valor regional (Bayes empírico), una regresión de Poisson, un modelo de aprendizaje
                automático (gradient boosting) que también usa la ubicación, la época del año, la intensidad del fuego (FRP) y la
                proporción día/noche, y un ensamble que promedia las predicciones de Bayes empírico y de aprendizaje automático.
              </li>
              <li>
                <strong>Probar con honestidad.</strong> Ocultamos un año de VIIRS a la vez, lo predecimos a partir de MODIS y medimos el
                error por país y mes (validación deja-un-año-fuera, 2012–2025). En la app se usa el método con menor error.
              </li>
              <li>
                <strong>Traducir el pasado.</strong> Antes de 2012 convertimos las detecciones MODIS en detecciones “equivalentes a VIIRS”
                con el método ganador, con un rango de incertidumbre (bajo–alto) tomado de los errores de validación. Entre noviembre de
                2000 y mediados de 2002 solo existía el satélite Terra, así que ahí se usa un modelo aparte solo con Terra. Desde febrero
                de 2012 usamos VIIRS directamente.
              </li>
            </ol>
            <p>El resultado: un solo calendario desde 2000 hasta hoy donde el sensor ya no importa.</p>
          </>
        ) : (
          <>
            <p>
              NASA has watched fires from space with two families of sensors. <strong>MODIS</strong> (Terra and Aqua satellites, since 2000) sees
              the ground in 1&nbsp;km pixels. <strong>VIIRS</strong> (since 2012) uses 375&nbsp;m pixels, so it detects many more small fires. If
              you simply stacked their counts, every year after 2012 would look like a fire explosion that never happened.
            </p>
            <ol>
              <li>
                <strong>Clean.</strong> Keep only confident vegetation-fire detections and remove persistent heat sources such as volcanoes and
                industrial sites.
              </li>
              <li>
                <strong>Learn the relationship.</strong> From 2012 on, both sensors observed the same places at the same time. On a 0.25° grid
                (~27&nbsp;km), month by month, we compare six methods: a single ratio, a ratio per calendar month, a ratio per grid cell and
                month shrunk toward the regional value (empirical Bayes), a Poisson regression, a machine-learning model (gradient
                boosting) that also uses location, season, fire intensity (FRP) and day/night share, and an ensemble that averages the
                empirical-Bayes and machine-learning predictions.
              </li>
              <li>
                <strong>Test honestly.</strong> We hide one year of VIIRS at a time, predict it from MODIS, and measure the error per country
                and month (leave-one-year-out validation, 2012–2025). The method with the lowest error is used in the app.
              </li>
              <li>
                <strong>Translate the past.</strong> Before 2012 we convert MODIS detections into “VIIRS-equivalent” detections with the winning
                method, with an uncertainty range (low–high) taken from the validation errors. Between Nov 2000 and mid-2002 only the Terra
                satellite existed, so a separate Terra-only model is used there. From Feb 2012 on, we use VIIRS directly.
              </li>
            </ol>
            <p>The result: a single calendar from 2000 to today where the sensor no longer matters.</p>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <ValidationIcon size={22} className="title-icon" /> {t("Validation results")}
        </h2>
        <AsyncBlock state={methods} what="validation results" isEmpty={(m) => m.metrics.length === 0} emptyMessage={t("No validation results are available yet.")}>
          {(m) => {
            const sorted = [...m.metrics].sort((x, y) => x.mae - y.mae);
            const years = m.metrics[0]?.years_evaluated ?? [];
            const maxMae = Math.max(...sorted.map((r) => r.mae), 1);
            return (
              <>
                <p className="help">
                  {t("Validation")}: {t(m.validation)}
                  {years.length > 0 && ` ${t("({from}–{to}, {n} years)", { from: years[0], to: years[years.length - 1], n: years.length })}`}.{" "}
                  {t("MAE = mean absolute error in detections per month; bias = average over- (+) or under- (−) estimation.")}
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">{t("Error of each harmonization method in leave-one-year-out validation")}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t("Method")}</th>
                        <th scope="col" className="num">
                          MAE
                        </th>
                        <th scope="col" className="num">
                          {t("Bias")}
                        </th>
                        <th scope="col" className="num">
                          R²
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => {
                        const chosen = r.method === m.chosen;
                        return (
                          <tr key={r.method} className={chosen ? "chosen" : undefined}>
                            <th scope="row">
                              {prettyMethod(r.method)} <span className="mono muted">({r.method})</span>
                              {chosen && (
                                <span className="badge">
                                  <LevelNormalIcon size={14} strokeWidth={2} /> {t("Used in the app")}
                                </span>
                              )}
                            </th>
                            <td className="num mae-cell">
                              <span className="mae-bar" aria-hidden="true">
                                <span style={{ width: `${Math.max(2, (r.mae / maxMae) * 100)}%` }} />
                              </span>
                              {r.mae.toFixed(1)}
                            </td>
                            <td className="num">{fmtPct(r.bias_pct, true)}</td>
                            <td className="num">{r.r2 === null ? "—" : r.r2.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </AsyncBlock>
      </section>
    </div>
  );
}
