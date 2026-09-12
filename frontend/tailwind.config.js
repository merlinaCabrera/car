/** @type {import('tailwindcss').Config} */

/* ============================================================================
   Paleta de marca — Club Atlético Roberts
   ----------------------------------------------------------------------------
   El manual de marca define una NORMA CROMÁTICA CERRADA: 4 tintas y nada más
   (prohibidos celestes, azules saturados ajenos y degradados de color).

   La app ya estaba escrita con las escalas por defecto de Tailwind repartidas
   en ~22.000 líneas de JSX. En vez de un find-replace masivo sobre 55 archivos
   —que es exactamente donde se rompen cosas— redefinimos las escalas acá:

     blue                              → Azul Roberts  (#183F7C)
     indigo · violet · purple · cyan   → Azul Camotí   (#26348C)
     teal                              → Azul Francia  (#1C1F2D)
     gray · slate · zinc · neutral     → neutro frío funcional
     green · emerald · lime            → verde de estado (atenuado)
     amber · yellow · orange           → ámbar de estado
     red · rose                        → rojo de estado

   Consecuencia intencional: `bg-blue-600 hover:bg-blue-700` —el patrón de
   botón primario que ya usaba toda la app— pasa a ser exactamente lo que pide
   el manual: fondo Azul Roberts con hover en Azul Camotí, sin tocar el JSX.

   Los tres azules se mantienen distinguibles entre sí porque hay pantallas que
   los usan a la vez para diferenciar cosas (categoría de orden, instalación,
   tipo de evento). Por eso `teal` no colapsa contra el neutro: su extremo
   claro conserva tinte azul.

   Los valores viven también en src/styles/variables.css como tokens legibles.
   ========================================================================== */

// Azul Roberts — primario institucional.
// Ojo con el 700: es Azul Camotí a propósito (el hover del manual), no un
// tono más oscuro del 600. Es el único punto no monótono de la escala.
const azulRoberts = {
  50:  '#EEF2F9',
  100: '#D9E2F1',
  200: '#B3C5E2',
  300: '#8AA5CF',
  400: '#5B80B4',
  500: '#335C97',
  600: '#183F7C',
  700: '#26348C',
  800: '#17315F',
  900: '#122748',
  950: '#0B172C',
}

// Azul Camotí — marca secundaria, acentos.
const azulCamoti = {
  50:  '#EFF0F9',
  100: '#DEE1F2',
  200: '#BEC3E5',
  300: '#9AA1D5',
  400: '#6D77BF',
  500: '#414FA5',
  600: '#26348C',
  700: '#202B75',
  800: '#1A245F',
  900: '#161D4C',
  950: '#0D1230',
}

// Azul Francia — contraste, sellos, documentación.
// Tercer tono de acento cuando una pantalla necesita diferenciar 3 cosas.
const azulFrancia = {
  50:  '#EEF1F7',
  100: '#DCE2EE',
  200: '#BFC8DD',
  300: '#98A5C2',
  400: '#6B7BA0',
  500: '#4A5A81',
  600: '#354566',
  700: '#28344F',
  800: '#1F293E',
  900: '#1C1F2D',
  950: '#11141E',
}

// Neutro funcional — no es color de marca. Frío, para convivir con los azules.
const neutro = {
  50:  '#F7F8F9',
  100: '#EFF1F3',
  200: '#E2E5E9',
  300: '#CBD0D8',
  // 400 se oscureció respecto del gris original de Tailwind (#9CA3AF): se usa
  // 250+ veces para textos de ayuda y ahí no llegaba ni a 2.7:1 sobre blanco.
  // Sigue por debajo de AA (queda en ~3.1:1), pero se lee bastante mejor y
  // mantiene un escalón visible contra el 500.
  400: '#8A92A1',
  500: '#6E7787',
  600: '#545C6C',
  700: '#3E4553',
  800: '#2A303C',
  900: '#1C1F2D',
  950: '#111420',
}

// Estados funcionales — único permiso fuera de la paleta, solo para estado.
const verdeEstado = {
  50:  '#EFF6F1',
  100: '#DBEAE0',
  200: '#B9D6C4',
  300: '#8DBB9F',
  400: '#5E9A77',
  500: '#3E7D59',
  600: '#2F6B4F',
  700: '#265842',
  800: '#1F4735',
  900: '#1A3A2C',
  950: '#0E1F18',
}

const ambarEstado = {
  50:  '#FDF8EC',
  100: '#FAEECF',
  200: '#F5DC9F',
  300: '#EDC366',
  400: '#E0A63A',
  500: '#C9861B',
  600: '#A96A12',
  700: '#854E12',
  800: '#6C3F15',
  900: '#5B3515',
  950: '#341B08',
}

const rojoEstado = {
  50:  '#FDF2F2',
  100: '#FBE0E0',
  200: '#F6C4C4',
  300: '#EE9B9B',
  400: '#E26B6B',
  500: '#D24343',
  600: '#BE2E2E',
  700: '#9E2525',
  800: '#832323',
  900: '#6E2323',
  950: '#3C0E0E',
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Nombres de marca (preferir estos en código nuevo) ────────────
        roberts: azulRoberts,
        camoti:  azulCamoti,
        francia: azulFrancia,

        // ── Escalas de Tailwind reasignadas a la paleta cerrada ──────────
        blue:    azulRoberts,
        sky:     azulRoberts,

        indigo:  azulCamoti,
        violet:  azulCamoti,
        purple:  azulCamoti,
        fuchsia: azulCamoti,
        cyan:    azulCamoti,

        teal:    azulFrancia,

        gray:    neutro,
        slate:   neutro,
        zinc:    neutro,
        neutral: neutro,
        stone:   neutro,

        green:   verdeEstado,
        emerald: verdeEstado,
        lime:    verdeEstado,

        amber:   ambarEstado,
        yellow:  ambarEstado,
        orange:  ambarEstado,

        red:     rojoEstado,
        rose:    rojoEstado,
        pink:    rojoEstado,
      },

      fontFamily: {
        // Inter es la tipografía de interfaz: cuerpo, botones, tablas, datos.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
               'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        // Playfair Display es la institucional: títulos y cabeceras del club.
        display: ['Playfair Display', 'Iowan Old Style', 'Georgia',
                  'Times New Roman', 'serif'],
        serif: ['Playfair Display', 'Georgia', 'Times New Roman', 'serif'],
      },

      // Una sola familia de sombras, tintada con el Azul Francia en vez del
      // negro puro: más suave y sin el gris sucio de las sombras por defecto.
      boxShadow: {
        sm:   '0 1px 2px 0 rgb(28 31 45 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(28 31 45 / 0.08), 0 1px 2px -1px rgb(28 31 45 / 0.05)',
        md:   '0 2px 6px -1px rgb(28 31 45 / 0.08), 0 1px 3px -1px rgb(28 31 45 / 0.05)',
        lg:   '0 6px 16px -4px rgb(28 31 45 / 0.10), 0 2px 6px -2px rgb(28 31 45 / 0.05)',
        xl:   '0 12px 28px -8px rgb(28 31 45 / 0.13), 0 4px 10px -4px rgb(28 31 45 / 0.06)',
        '2xl':'0 24px 48px -12px rgb(28 31 45 / 0.18)',
      },

      keyframes: {
        scan: {
          '0%, 100%': { top: '20%', opacity: '1' },
          '50%':      { top: '80%', opacity: '0.6' },
        }
      },
      animation: {
        scan: 'scan 2s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
