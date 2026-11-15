// Español. La llave es el texto en inglés tal como aparece en el código (ver `t()` en index.ts).
// Los marcadores `{nombre}` deben conservarse igual en la traducción.
export const ES: Record<string, string> = {
  // ---- general / encabezado
  "Skip to results": "Saltar a los resultados",
  "Area and period selection": "Selección de área y periodo",
  Map: "Mapa",
  "Loading map": "Cargando el mapa",
  Language: "Idioma",
  "Choose view": "Elegir vista",
  Responder: "Respuesta",
  Analyst: "Analista",
  view: "(vista)",
  "26 years of satellite fire detections on one comparable scale": "26 años de detecciones satelitales de fuego en una sola escala comparable",
  "Harmonized Burning Activity Calendar": "Calendario armonizado de actividad de quema",
  "Live data": "Datos en vivo",
  "Demo data": "Datos de demostración",
  "Connecting…": "Conectando…",
  "Data:": "Datos:",
  "Map tiles © OpenStreetMap contributors": "Teselas del mapa © colaboradores de OpenStreetMap",
  "Team InnovaSoft": "Equipo InnovaSoft",

  // ---- conexión
  "Waking up the server…": "Despertando el servidor…",
  "This can take up to a minute the first time.": "La primera vez puede tardar hasta un minuto.",
  "The free server sleeps when idle; this can take up to a minute (attempt {a} of {n}).":
    "El servidor gratuito se duerme cuando no se usa; esto puede tardar hasta un minuto (intento {a} de {n}).",
  "The free server sleeps when idle and can take up to a minute to start. We will retry automatically.":
    "El servidor gratuito se duerme cuando no se usa y puede tardar hasta un minuto en arrancar. Reintentaremos automáticamente.",
  "Use demo data now": "Usar datos de demostración",
  "Demo data.": "Datos de demostración.",
  "This build runs without a server: numbers are synthetic samples that mimic the real seasonal pattern.":
    "Esta versión funciona sin servidor: las cifras son muestras sintéticas que imitan el patrón estacional real.",
  "The live server could not be reached, so you are seeing synthetic sample data. Do not use it for decisions.":
    "No se pudo conectar con el servidor, así que estás viendo datos sintéticos de muestra. No los uses para tomar decisiones.",
  "Try the live server again": "Reintentar con el servidor",
  "Loading analyst tools…": "Cargando las herramientas de análisis…",
  "The server took too long to answer.": "El servidor tardó demasiado en responder.",
  "Could not reach the server.": "No se pudo conectar con el servidor.",
  "Server error ({code}).": "Error del servidor ({code}).",
  "Unexpected error.": "Error inesperado.",

  // ---- estados de carga
  "Could not load the {what}.": "No se pudo cargar: {what}.",
  "Loading {what}…": "Cargando: {what}…",
  "Retry now": "Reintentar ahora",
  calendar: "calendario",
  anomalies: "anomalías",
  comparison: "comparación",
  "current fire status": "estado actual del fuego",
  "validation results": "resultados de validación",
  "No fire detections here": "No hay detecciones de fuego aquí",
  "There are no hotspots in this area for the selected period. Try a larger area, another location on land, or a longer date range.":
    "No hay puntos de calor en esta área para el periodo elegido. Prueba con un área más grande, otro lugar en tierra firme o un rango de fechas más largo.",
  "Could not load the persistent heat sources layer.": "No se pudo cargar la capa de fuentes de calor persistentes.",

  // ---- panel de área y periodo
  "Area & period": "Área y periodo",
  "Where? Choose the area": "¿Dónde? Elige el área",
  "Area selection mode": "Modo de selección del área",
  Country: "País",
  Draw: "Dibujar",
  "Lat / Lon": "Lat / Lon",
  "Loading countries…": "Cargando países…",
  "Rectangle: {box} (W, S, E, N).": "Rectángulo: {box} (O, S, E, N).",
  "Polygon with {n} vertices.": "Polígono con {n} vértices.",
  several: "varios",
  "Pick the rectangle or polygon tool in the map toolbar, then draw. Drawing again replaces the area.":
    "Elige la herramienta de rectángulo o polígono en la barra del mapa y dibuja. Al dibujar de nuevo se reemplaza el área.",
  "Clear drawing": "Borrar dibujo",
  Latitude: "Latitud",
  Longitude: "Longitud",
  "Radius (km)": "Radio (km)",
  "Tip: click the map to set the center.": "Consejo: haz clic en el mapa para fijar el centro.",
  "From year": "Desde el año",
  "To year": "Hasta el año",
  "{y} (latest)": "{y} (más reciente)",
  "Compare against (reference period)": "Comparar contra (periodo de referencia)",
  "All years": "Todos los años",
  "2001–2011 (MODIS era)": "2001–2011 (era MODIS)",
  "2012–{y} (VIIRS era)": "2012–{y} (era VIIRS)",
  "Custom…": "Personalizado…",
  "Reference from": "Referencia desde",
  "Reference to": "Referencia hasta",
  "Show excluded persistent heat sources (volcanoes, industry)": "Mostrar las fuentes de calor persistentes excluidas (volcanes, industria)",

  // ---- validación del formulario
  "Choose a country.": "Elige un país.",
  "Draw a rectangle or polygon on the map.": "Dibuja un rectángulo o un polígono en el mapa.",
  "The drawn rectangle is empty. Draw it again.": "El rectángulo dibujado está vacío. Dibújalo de nuevo.",
  "Latitude must be a number between -90 and 90.": "La latitud debe ser un número entre -90 y 90.",
  "Longitude must be a number between -180 and 180.": "La longitud debe ser un número entre -180 y 180.",
  "Radius must be a positive number of kilometers.": "El radio debe ser un número positivo de kilómetros.",
  "Radius must be {n} km or less.": "El radio debe ser de {n} km o menos.",
  "Reference years must be whole years.": "Los años de referencia deben ser años enteros.",
  "Reference period: the first year must not be after the last year.": "Periodo de referencia: el primer año no puede ser posterior al último.",
  "Reference period needs at least 3 years.": "El periodo de referencia necesita al menos 3 años.",
  "Start year must not be after end year.": "El año inicial no puede ser posterior al año final.",
  "That place is outside the region FireCal covers. Choose a location inside the highlighted area of the map.":
    "Ese lugar está fuera de la región que cubre FireCal. Elige una ubicación dentro del área resaltada del mapa.",

  // ---- nombres de áreas
  "Box {box}": "Recuadro {box}",
  "{r} km around {lat}, {lon}": "{r} km alrededor de {lat}, {lon}",
  "Drawn polygon": "Polígono dibujado",
  Area: "Área",
  Belize: "Belice",
  Panama: "Panamá",

  // ---- mapa
  "Use the rectangle or polygon tool (top left) to draw your area.": "Usa la herramienta de rectángulo o polígono (arriba a la izquierda) para dibujar tu área.",
  "Click the map to set the center point.": "Haz clic en el mapa para fijar el punto central.",
  "Map of the area of interest": "Mapa del área de interés",
  "Persistent heat source": "Fuente de calor persistente",
  "static source": "fuente estática",
  "excluded from counts": "excluida de los conteos",
  "{n} detections": "{n} detecciones",
  "in {n} years": "en {n} años",

  // ---- descargas
  "Download failed: {msg}": "La descarga falló: {msg}",
  "Preparing report…": "Preparando el informe…",
  "Download PDF report": "Descargar informe PDF",
  "Preparing CSV…": "Preparando el CSV…",
  "Download hotspots CSV": "Descargar CSV de puntos de calor",
  Downloads: "Descargas",
  "CSV with every hotspot in the selection (with its harmonization weight), or a short PDF report.":
    "CSV con cada punto de calor de la selección (con su peso de armonización) o un informe breve en PDF (en inglés).",

  // ---- niveles de alerta
  Normal: "Normal",
  Elevated: "Elevado",
  High: "Alto",
  Extreme: "Extremo",
  "No data": "Sin datos",
  "No detections": "Sin detecciones",
  "Logo, icons and parts of the code were made with AI assistance (Claude, Gemini).": "El logo, los íconos y parte del código se hicieron con asistencia de IA (Claude, Gemini).",
  "No fire was detected here in this month, so there is no activity level to rate.": "No se detectó fuego aquí en este mes, así que no hay nivel de actividad que calificar.",
  "Activity is within the usual range for this month.": "La actividad está dentro del rango habitual para este mes.",
  "Above the typical level for this month. Stay alert.": "Por encima del nivel típico para este mes. Mantente alerta.",
  "Well above normal for this month. Prepare resources.": "Muy por encima de lo normal para este mes. Prepara recursos.",
  "Among the highest ever recorded for this month.": "Entre los valores más altos registrados para este mes.",
  "Not enough detections to compare against history.": "No hay suficientes detecciones para comparar con el historial.",
  "burning activity level": "nivel de actividad de quema",
  "Alert scale": "Escala de alerta",

  // ---- vista de respuesta
  "Choose an area to see its fire status": "Elige un área para ver su estado del fuego",
  "Pick a country, draw on the map, or enter a latitude and longitude.": "Elige un país, dibuja en el mapa o escribe una latitud y una longitud.",
  "Change area or period": "Cambiar área o periodo",
  "Detections this month": "Detecciones este mes",
  "Typical: {n}": "Típico: {n}",
  "Peak month of the year": "Mes pico del año",
  "Highest median month": "Mes con la mediana más alta",
  "Most active year": "Año más activo",
  "Harmonized, selected period": "Armonizado, periodo seleccionado",
  "Last {n} years, month by month": "Últimos {n} años, mes a mes",
  "Darker = more fire · harmonized detections": "Más oscuro = más fuego · detecciones armonizadas",
  "Harmonized fire detections per month (VIIRS-equivalent)": "Detecciones de fuego armonizadas por mes (equivalente VIIRS)",
  Year: "Año",
  "{month} {year}: {n} detections": "{month} {year}: {n} detecciones",
  "Levels compare the latest month with the same month in past years (percentile): Normal < 75th, Elevated ≥ 75th, High ≥ 90th, Extreme ≥ 97.5th. Months with 1–4 detections are always Normal; months with none show No detections. Counts are satellite hotspots, not individual fires; clouds and smoke can hide fires.":
    "Los niveles comparan el último mes con el mismo mes de años anteriores (percentil): Normal < 75, Elevado ≥ 75, Alto ≥ 90, Extremo ≥ 97.5. Los meses con 1 a 4 detecciones son siempre Normal; los meses sin ninguna muestran Sin detecciones. Los conteos son puntos de calor vistos por satélite, no incendios individuales; las nubes y el humo pueden ocultar incendios.",

  // ---- leyenda de color
  "Color scale: light means few detections, dark means many, up to {n} per month (square-root scale).":
    "Escala de color: claro significa pocas detecciones y oscuro muchas, hasta {n} por mes (escala de raíz cuadrada).",
  "Darker = more fire · detections / month, square-root scale": "Más oscuro = más fuego · detecciones / mes, escala de raíz cuadrada",

  // ---- vista de analista
  "Analyst sections": "Secciones de análisis",
  "Calendar & anomalies": "Calendario y anomalías",
  "Compare two areas": "Comparar dos áreas",
  "Method & validation": "Método y validación",
  "Burning activity calendar": "Calendario de actividad de quema",
  "Each cell is one month. Hover or tap a cell for the harmonized value, its uncertainty range and the raw sensor counts.":
    "Cada celda es un mes. Pasa el cursor o toca una celda para ver el valor armonizado, su rango de incertidumbre y los conteos crudos de cada sensor.",
  "Values shown in the calendar": "Valores que muestra el calendario",
  Harmonized: "Armonizado",
  "Harmonized (VIIRS-equivalent)": "Armonizado (equivalente VIIRS)",
  "Raw MODIS": "MODIS crudo",
  "Raw VIIRS": "VIIRS crudo",
  "Raw hotspots (MODIS + VIIRS)": "Puntos de calor crudos (MODIS + VIIRS)",
  Years: "Años",
  "Harmonization method": "Método de armonización",
  "VIIRS (375 m) starts in January 2012; earlier years are shown as “no data”.": "VIIRS (375 m) empieza en enero de 2012; los años anteriores se muestran como «sin datos».",
  "Raw MODIS (1 km) counts are lower because MODIS misses many small fires that VIIRS sees.":
    "Los conteos crudos de MODIS (1 km) son menores porque MODIS no detecta muchos incendios pequeños que VIIRS sí ve.",
  "Monthly anomalies vs. the historical median": "Anomalías mensuales frente a la mediana histórica",
  "How far each month is above (ember) or below (sky blue) the median of the same calendar month in the reference period.":
    "Cuánto está cada mes por encima (naranja) o por debajo (celeste) de la mediana del mismo mes del calendario en el periodo de referencia.",
  "Choose an area first": "Primero elige un área",

  // ---- gráficos
  "not available (before 2012)": "no disponible (antes de 2012)",
  "Calendar heatmap of {what} fire detections per month, {from} to {to}. Highest month: {month} {year} with {n} detections.":
    "Mapa de calor del calendario de detecciones de fuego por mes ({what}), de {from} a {to}. Mes más alto: {month} {year} con {n} detecciones.",
  "Calendar heatmap with no data.": "Mapa de calor del calendario sin datos.",
  "Years in sand": "Años en color arena",
  "MODIS converted to VIIRS-equivalent": "MODIS convertido a equivalente VIIRS",
  white: "blanco",
  "VIIRS observed": "VIIRS observado",
  "Bar chart of monthly anomalies versus the median of the same month in {from}–{to}. {above} of {total} months were above the median.":
    "Gráfico de barras de anomalías mensuales frente a la mediana del mismo mes en {from}–{to}. {above} de {total} meses estuvieron por encima de la mediana.",
  Detections: "Detecciones",
  "Median (same month)": "Mediana (mismo mes)",
  Difference: "Diferencia",
  Ratio: "Razón",
  Percentile: "Percentil",
  Level: "Nivel",
  "vs median": "frente a la mediana",
  "Above median": "Sobre la mediana",
  "Below median": "Bajo la mediana",
  "Reference: {from}–{to} · drag the slider to change the window": "Referencia: {from}–{to} · arrastra el control para cambiar la ventana",
  "Seasonal profile: median detections per month. Area A peaks in {a}, area B peaks in {b}. Each area uses its own vertical axis.":
    "Perfil estacional: mediana de detecciones por mes. El área A tiene su pico en {a} y el área B en {b}. Cada área usa su propio eje vertical.",

  // ---- comparación
  "Not enough data to compute a correlation.": "No hay datos suficientes para calcular una correlación.",
  "Current area ({name})": "Área actual ({name})",
  "Same period and the same harmonization for both areas. Each calendar uses its own color scale.":
    "Mismo periodo y misma armonización para ambas áreas. Cada calendario usa su propia escala de color.",
  "Area A": "Área A",
  "Area B": "Área B",
  "Choose a valid area first": "Primero elige un área válida",
  "“Current area” needs a valid selection in the Area & period panel.": "«Área actual» necesita una selección válida en el panel de Área y periodo.",
  "Correlation (monthly series)": "Correlación (serie mensual)",
  "Seasonal profile (median per month)": "Perfil estacional (mediana por mes)",
  "very strong": "muy fuerte",
  strong: "fuerte",
  moderate: "moderada",
  weak: "débil",
  "no clear": "poco clara",
  positive: "positiva",
  negative: "negativa",
  "tend to burn in the same months and years": "tienden a quemarse en los mismos meses y años",
  "follow different burning patterns": "siguen patrones de quema distintos",

  // ---- método y validación
  "How the harmonization works": "Cómo funciona la armonización",
  "Validation results": "Resultados de validación",
  "No validation results are available yet.": "Todavía no hay resultados de validación.",
  Validation: "Validación",
  "leave-one-year-out over the MODIS/VIIRS overlap": "deja-un-año-fuera sobre el periodo común de MODIS y VIIRS",
  "leave-one-year-out over the MODIS/VIIRS overlap (2012-2025), errors at country x month":
    "deja-un-año-fuera sobre el periodo común de MODIS y VIIRS (2012-2025), errores por país y mes",
  "({from}–{to}, {n} years)": "({from}–{to}, {n} años)",
  "MAE = mean absolute error in detections per month; bias = average over- (+) or under- (−) estimation.":
    "MAE = error absoluto medio en detecciones por mes; sesgo = sobreestimación (+) o subestimación (−) promedio.",
  "Error of each harmonization method in leave-one-year-out validation": "Error de cada método de armonización en la validación deja-un-año-fuera",
  Method: "Método",
  Bias: "Sesgo",
  "Used in the app": "Usado en la app",
  "Monthly ratio (k per month)": "Razón mensual (k por mes)",
  "Seasonal ratio (dry / wet season)": "Razón estacional (época seca / lluviosa)",
  "Single global ratio": "Una sola razón global",
  "Poisson regression (GLM)": "Regresión de Poisson (GLM)",
  "Gradient boosting": "Gradient boosting",
  "Ratio per grid cell and month (empirical Bayes)": "Razón por celda y mes (Bayes empírico)",
  "Ensemble: empirical Bayes + gradient boosting": "Ensamble: Bayes empírico + gradient boosting",

  // ---- detalle del mes elegido en el calendario
  "Darker = more fire · tap a month for details": "Más oscuro = más fuego · toca un mes para ver su detalle",
  "{month} {year}: no data": "{month} {year}: sin datos",
  "Each cell is one month; darker means more fire. Click or tap a month to see how it compares with the usual for that month.":
    "Cada celda es un mes; más oscuro significa más fuego. Toca o haz clic en un mes para ver cómo se compara con lo habitual para ese mes.",
  "Click or tap any month in the calendar to see its details here.": "Toca o haz clic en cualquier mes del calendario para ver aquí su detalle.",
  "Details for {month}": "Detalle de {month}",
  "fire detections": "detecciones de fuego",
  "(likely {lo}–{hi})": "(probablemente entre {lo} y {hi})",
  "No data for this month yet.": "Todavía no hay datos de este mes.",
  "Not enough history to compare this month.": "No hay historial suficiente para comparar este mes.",
  "{r}× the usual for {month}": "{r}× lo habitual para {month}",
  "The usual for {month} is {n}": "Lo habitual para {month} es {n}",
  "The highest {month} in the reference period.": "El mes de {month} más alto del periodo de referencia.",
  "The lowest {month} in the reference period.": "El mes de {month} más bajo del periodo de referencia.",
  "Higher than {p}% of past {month} months in the reference period.": "Más alto que el {p} % de los demás meses de {month} del periodo de referencia.",
  "Lower than {p}% of past {month} months in the reference period.": "Más bajo que el {p} % de los demás meses de {month} del periodo de referencia.",
  "Typical {month}": "Típico de {month}",
  "Seen by MODIS (1 km)": "Visto por MODIS (1 km)",
  "Seen by VIIRS (375 m)": "Visto por VIIRS (375 m)",
  "not in orbit yet": "aún no estaba en órbita",
  "Estimated from MODIS: VIIRS did not exist yet, so this value is converted to what VIIRS would have seen.":
    "Estimado a partir de MODIS: VIIRS aún no existía, así que este valor se convirtió a lo que VIIRS habría visto.",

  // ---- mejoras de UX (QA): escala de niveles, ayudas y estado vacío
  "What does this mean?": "¿Qué significa esto?",
  "Below the 75th percentile of past {month} months: no unusual burning.": "Por debajo del percentil 75 de los meses de {month} anteriores: no hay quemas fuera de lo habitual.",
  "Between the 75th and 90th percentile of past {month} months: more burning than usual.":
    "Entre el percentil 75 y el 90 de los meses de {month} anteriores: más quemas de lo habitual.",
  "Between the 90th and 97.5th percentile of past {month} months: well above usual.":
    "Entre el percentil 90 y el 97.5 de los meses de {month} anteriores: muy por encima de lo habitual.",
  "Above the 97.5th percentile of past {month} months: among the highest on record.":
    "Por encima del percentil 97.5 de los meses de {month} anteriores: entre los más altos registrados.",
  "Not enough past years to compare this month.": "No hay suficientes años anteriores para comparar este mes.",
  "No fire was detected, so there is no level to rate.": "No se detectó fuego, así que no hay un nivel que calificar.",
  "Fewer than 5 detections: too few to rate against past years, so it counts as Normal.":
    "Menos de 5 detecciones: son muy pocas para compararlas con años anteriores, así que cuenta como Normal.",
  "Show the full alert scale": "Mostrar la escala de alerta completa",
  "Hide the full alert scale": "Ocultar la escala de alerta completa",
  "current level": "nivel actual",
  "How the alert scale works": "Cómo funciona la escala de alerta",
  "Each month is compared with the same month in past years. The percentile says how many of those past months had fewer detections.":
    "Cada mes se compara con el mismo mes de años anteriores. El percentil indica cuántos de esos meses tuvieron menos detecciones.",
  "Months with 1–4 detections are always Normal, and months with none show No detections instead of a level.":
    "Los meses con 1 a 4 detecciones son siempre Normal, y los meses sin ninguna muestran «Sin detecciones» en lugar de un nivel.",
  "What is {term}?": "¿Qué es {term}?",
  "More information": "Más información",
  Typical: "Típico",
  hotspot: "punto de calor",
  "The middle value for this month in past years: half of them had more detections and half had fewer.":
    "El valor central para este mes en años anteriores: la mitad tuvo más detecciones y la otra mitad, menos.",
  "The month that usually has the most fire detections in this area.": "El mes que normalmente tiene más detecciones de fuego en esta área.",
  "The year with the most fire detections in the period you selected.": "El año con más detecciones de fuego en el periodo que elegiste.",
  "Counts from both satellite sensors put on one scale, so years before and after 2012 can be compared.":
    "Conteos de los dos sensores satelitales puestos en una misma escala, para poder comparar los años anteriores y posteriores a 2012.",
  "What the older MODIS sensor counted (1 km pixels, since 2000). It misses many small fires.":
    "Lo que contó el sensor MODIS, el más antiguo (píxeles de 1 km, desde 2000). No detecta muchos incendios pequeños.",
  "What the newer VIIRS sensor counted (375 m pixels, since 2012). It sees smaller fires.":
    "Lo que contó el sensor VIIRS, el más nuevo (píxeles de 375 m, desde 2012). Detecta incendios más pequeños.",
  "A place where a satellite detected unusual heat, usually a fire. One fire can produce several hotspots.":
    "Un lugar donde un satélite detectó calor inusual, casi siempre un incendio. Un mismo incendio puede producir varios puntos de calor.",
};
