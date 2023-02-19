const _ = require("lodash");
const fileEs = require("./lang/es.json");
const fs = require("fs/promises");
const he = require("he");
const xl = require("excel4node");
const XLSX = require("xlsx");

const Languages = {
  es: "es_ES",
  ca: "ca_ES",
  de: "de_DE",
  en: "en_UK",
  eu: "eu_ES",
  fr: "fr_FR",
  gl: "gl_ES",
  pt: "pt_PT",
  va: "va_ES",
};

const TEXT_NOT_FOUND = [];
const keysLanguages = Object.keys(Languages);
const MISSING_TRANSLATIONS = {};
const PENDING_TRANSLATIONS = [];

const notTranslatable = [
  "Fee Notice: ATM acquirer will assess a fee to cardholders for international ATM Cash Disbursements. This fee is added to the amount of your transaction and is in addition to any fees that may be charged by your financial institution.",
  "I HAVE BEEN OFFERED A CHOICE OF",
  "CURRENCIES FOR THIS WITHDRAWAL",
];

const HEADER_XLSX = [
  "Funcionalidad \ndonde se encuentra el texto",
  "CODIGO Literal",
  "Texto a traducir en castellano(es_ES)",
  "Texto traducido a catalán(ca_ES)",
  "Texto traducido a alemán(de_DE)",
  "Texto traducido a inglés(en_UK)",
  "Texto traducido a euskera(eu_ES)",
  "Texto traducido a francés(fr_FR)",
  "Texto traducido a gallego(gl_ES)",
  "Texto traducido a portugués(pt_PT)",
  "Texto traducido a valenciano(va_ES)",
];

/**
 * Create .JSON file for control version from XLSX file
 * @param { Object } from data file XLSX
 */
function dataVersion(data) {
  const dataControlVersion = {};

  data.map((t) => {
    dataControlVersion[t["Texto a traducir en castellano(es_ES)"]] = {
      ca: t["Texto traducido a catalán(ca_ES)"],
      de: t["Texto traducido a alemán(de_DE)"],
      en: t["Texto traducido a inglés(en_UK)"],
      eu: t["Texto traducido a euskera(eu_ES)"],
      fr: t["Texto traducido a francés(fr_FR)"],
      gl: t["Texto traducido a gallego(gl_ES)"],
      pt: t["Texto traducido a portugués(pt_PT)"],
      va: t["Texto traducido a valenciano(va_ES)"],
    };
  });

  fs.writeFile(
    "archivos/dataVersion.json",
    JSON.stringify(dataControlVersion, null, 4),
    "utf8"
  );
}

/**
 * function for reading literals to import
 * @param { String }  filename path
 * @return {{data: Object[], rawCols: string[]}} sheet info
 */
function readExcelFile(filename) {
  // Read the file
  const workbook = XLSX.readFile(filename);

  // The sheets of the document are obtained and the one with the name cashiers is searched
  const sheet = workbook.SheetNames.filter(
    (s) => s.toLowerCase() === "cajeros"
  );

  // We convert data to JSON this generates an array with JSON objects
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);

  // Save file .JSON for later use in version control
  dataVersion(data);

  // we stay with the columns
  const rawCols = Object.keys(data[0] || {});

  const readExcel = {
    data,
    rawCols,
  };

  return readExcel;
}

/**
 * function for reading literals to import
 * @param { String }  filename path
 * @return {{es: string[]}} translation map for texts in Spanish
 */
function fileContent(filename) {
  const readExcel = readExcelFile(filename);
  const data = readExcel.data;
  const rawCols = readExcel.rawCols;

  const content = {};
  const columnas = {};
  Object.keys(Languages).forEach(
    (c) => (columnas[c] = rawCols.find((r) => r.includes(Languages[c])))
  );

  data.forEach((property) => {
    const translations = {};
    Object.keys(columnas)
      .filter((k) => k !== "es")
      .forEach((k) => (translations[k] = property[columnas[k]] || undefined));

    content[property[columnas.es]] = translations;
  });

  return content;
}

/**
 * Search for a text in a json file and add its route to the map
 * @param { String }  es Spanish literals file content
 * @param { String | undefined }  parent name of the parent for recursive calls
 * @param { Object | undefined }  result result object for recursive calls
 * @return { Object } route map
 */
function mapText(es, parent, result = {}) {
  Object.entries(es).forEach(([f, claves]) => {
    if (typeof es[f] === "string") {
      const statusLanguages = keysLanguages.includes(f);

      if (!statusLanguages) {
        if (!result[claves]) {
          result[claves] = [];
        }
        result[claves].push(parent ? `${parent}.${f}` : f);
      }
    } else {
      mapText(es[f], parent ? `${parent}.${f}` : f, result);
    }
  });

  return result;
}

/**
 * Fill array of pending translations
 * @param {{text: {lang: string}}}  prop literal
 * @param {{text: {lang: string}}}  text text in Spanish
 */
function pendingTranslation(prop, text) {
  const codeApt = "P00027789";

  if (!notTranslatable.includes(text) && !PENDING_TRANSLATIONS.includes(text)) {
    PENDING_TRANSLATIONS.push(codeApt, `${prop}:`, text);
  }
}

/**
 * Fill object of  missing translations
 * @param {{text: {lang: string}}}  idioma language
 * @param {{text: {lang: string}}}  text traducción
 */
function missingTranslationsByLanguage(idioma, text) {
  if (MISSING_TRANSLATIONS[text]?.length) {
    MISSING_TRANSLATIONS[text].push(idioma);
  } else {
    MISSING_TRANSLATIONS[text] = [idioma];
  }
}

/**
 * Find the translation texts that are not on the Spanish text map
 * @param { String }  keysTranslations import xlsx file translations keys
 * @param { String }  keysTextMapEs literal keys in file es_ES
 * @return {{text: path[]}} mapa de rutas donde se encuentra un texto concreto
 */
function textsNotFound(keysTranslations, keysTextMapEs) {
  const list = keysTranslations.filter((text) => !keysTextMapEs.includes(text));

  TEXT_NOT_FOUND.push(...list);

  return TEXT_NOT_FOUND;
}

/**
 * template verification in literals
 * @param { String }  translationsByidioma translation by idioma in xlsx file
 * @param { String }  templates  literals in json file in spanish
 * @return { String}  new template or original template
 */
function templateVerification(translationsByidioma, templates) {
  const templatesInTranlation = translationsByidioma.match(/{([^}]*)}/g);

  templatesInTranlation.forEach((t) => {
    if (!templates.includes(t)) {
      const index = templatesInTranlation.indexOf(t);
      translationsByidioma = translationsByidioma.replace(t, templates[index]);
    }
  });

  return translationsByidioma;
}

/**
 * Map file texts from languages
 * @param {{text: {lang: string}}}  translations text translation map
 * @param { Array }   keysTranslations translation keys
 * @param { Object }  textMapEs route map where to find each ES text
 * @param { String }  idioma language to generate the translation from
 * @param { String }  base object to start from (in case you want to update instead of creating from scratch)
 * @return { Object } cloned structure of the ES with the translations in the selected language
 */
function createTranslate(
  translations,
  keysTranslations,
  textMapEs,
  idioma,
  base = {}
) {
  Object.entries(textMapEs).forEach(([text, claves]) => {
    claves.forEach((clave) => {
      const ruta = clave.split(".");
      const prop = ruta.pop();
      let obj = base;

      // Verify that the text is in the translation keys
      const statusTranslate = keysTranslations.includes(text);
      const translateByIdioma = statusTranslate
        ? translations[text][idioma]
        : false;

      if (statusTranslate) {
        if (translateByIdioma) {
          // The key is added in base = { common : {}}, if it does not match it adds an empty object or array
          ruta.forEach(
            (r) =>
              (obj = obj[r] ? obj[r] : (obj[r] = prop.match(/^\d+$/) ? [] : {}))
          );

          let textByIdioma;
          const templates = text.match(/{([^}]*)}/g);
          if (templates) {
            textByIdioma = templateVerification(
              translations[text][idioma],
              templates
            );
          }

          obj[prop] = he
            .decode(textByIdioma || translations[text][idioma], {
              isAttributeValue: true,
            })
            .trim();
        } else {
          missingTranslationsByLanguage(idioma, text);
        }
      } else {
        pendingTranslation(prop, text);
      }
    });
  });

  // TODO: mejorar y poner en otro fichero los textos a duplicar igual que textos a excluir de los test de missing
  base.contacto = {
    ...base.contacto,
    cancelacion: fileEs.contacto.cancelacion,
  };

  base.reciboPapel.dcc = {
    ...base.reciboPapel.dcc,
    importeAFEE: fileEs.reciboPapel.dcc.importeAFEE,
    importeDivisa: fileEs.reciboPapel.dcc.importeDivisa,
    comisionDCC: fileEs.reciboPapel.dcc.comisionDCC,
    informacionDCC1: fileEs.reciboPapel.dcc.informacionDCC1,
    informacionDCC2: fileEs.reciboPapel.dcc.informacionDCC2,
  };

  base.recibos.correo = {
    ...base.recibos.correo,
    descripcion: fileEs.recibos.correo.descripcion,
  };

  return base;
}

/**
 * Create xlsx file with pending translations
 * @param {{text: {lang: string}}}  header xlsx file table header texts
 */
function createXlsxFile() {
  try {
    const date = new Date();
    const filename = `Traducciones_${date.getDate()}${date.getMonth()}${date.getFullYear()}.xlsx`;

    // Create a new workbook
    const workbook = new xl.Workbook({
      defaultFont: {
        name: "Calibri",
        color: "FFFFFFFF",
        border: "TopBottom",
        borderColour: "#4F81BD",
      },
      author: "kyaalena",
    });

    // A sheet name is assigned and inserted into the SheetNames array
    const worksheet = workbook.addWorksheet("textos");

    const sheetBorders = {
      left: {
        style: "thin",
        color: "#000000",
      },
      right: {
        style: "thin",
        color: "#000000",
      },
      top: {
        style: "thin",
        color: "#000000",
      },
      bottom: {
        style: "thin",
        color: "#000000",
      },
    };

    // Add style to the worksheet
    const headerStyle = workbook.createStyle({
      font: {
        bold: true,
        color: "#121211",
        size: 10,
      },
      fill: {
        type: "pattern",
        patternType: "solid",
        fgColor: "#92d050",
      },
      alignment: {
        horizontal: "center",
        vertical: "bottom",
        wrapText: true,
      },
      border: sheetBorders,
    });

    const bodyStyle = workbook.createStyle({
      font: {
        color: "#030202",
        size: 9,
      },
      border: sheetBorders,
      alignment: {
        wrapText: true,
      },
    });

    // Dump content inside the sheet
    const data = [HEADER_XLSX, ..._.chunk(PENDING_TRANSLATIONS, 3)];
    let x = 0;
    let y = 0;

    const columnWidth = {
      1: 23,
      2: 30,
      3: 35,
      idiomas: [4, 5, 6, 7, 8, 9, 10, 11],
    };

    data.forEach((row) => {
      x = ++x;
      worksheet.row(x).setHeight(x === 1 ? 25 : 15);

      row.forEach((column) => {
        worksheet
          .cell(x, (y = ++y)) // Start dump in row 1, column 1, 2 and 3...
          .string(column)
          .style(x === 1 ? headerStyle : bodyStyle);

        worksheet
          .column(y)
          .setWidth(columnWidth.idiomas.includes(y) ? 14 : columnWidth[y]);
      });
      y = 0;
    });

    // Export workbook as xlsx binary
    workbook.write(filename);
  } catch (e) {
    console.error("El archivo XLSX no se ha podido crear: ", e);
  }
}

/**
 * Import and create translations from languages
 */
async function importAndCreateTranslations() {
  const translations = fileContent("archivos/literales.xlsx");
  const textMapEs = mapText(fileEs);
  const keysTranslations = Object.keys(translations);
  const keysTextMapEs = Object.keys(textMapEs);

  textsNotFound(keysTranslations, keysTextMapEs);

  await Promise.all(
    Object.keys(Languages)
      .filter((k) => k !== "es")
      .map((i) =>
        fs.writeFile(
          `src/lang/${i}.json`,
          JSON.stringify(
            createTranslate(translations, keysTranslations, textMapEs, i),
            null,
            4
          ),
          "utf8"
        )
      )
  );
  console.log(
    "Se han generado los archivos .json con los literales para los idiomas"
  );

  if (Object.entries(TEXT_NOT_FOUND).length) {
    console.warn("Textos no encontrados", TEXT_NOT_FOUND);
  }

  if (Object.entries(MISSING_TRANSLATIONS).length) {
    console.warn(
      "Literales con traducciones incompletas",
      MISSING_TRANSLATIONS
    );
  }

  if (Object.entries(PENDING_TRANSLATIONS).length) {
    console.warn(
      "El número de textos pendientes por traducir es: ",
      PENDING_TRANSLATIONS.length / 3
    );
    console.warn("Generando archivo XLSX ...");
    createXlsxFile();
    console.warn("Archivo XLSX ha sido exportado correctamente :)");
  }
}

module.exports = {
  importAndCreateTranslations,
};
