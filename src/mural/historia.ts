/**
 * El script de `/historia`: el relato de donde sale la figura del mural
 * —la visualizacion de datos, el mito de Quetzalcoatl y la dieta de la milpa.
 *
 * La pagina es texto, fotos y las nueve muestras de la escala, asi que aqui
 * no entra el motor de acuarela: ni el dibujo, ni las zonas, ni el CSV, ni el
 * `localStorage`. Solo las tres cosas que la pagina necesita del mural y que
 * viven en `./pagina`: el revelado de los bloques con el scroll, los
 * fragmentos de red del fondo de «Visualización de datos» y el pincel de las
 * muestras de esa misma seccion. El relevo de las fotos de la milpa es CSS
 * puro (ver `mural.css`) y no necesita a nadie.
 *
 * Por eso tiene entrada propia y no comparte la de `/`: importar `./main`
 * aqui arrastraria el motor entero y montaria el kiosco en el `<body>` —su
 * punto de anclaje, `#mural-mount`, no existe en esta ruta.
 *
 * La rampa es una sola para las dos cosas que pintan: el fondo de red y las
 * muestras tienen que salir del mismo carmin, que es el del mural.
 */
import { CARMIN, ColorRamp } from '@core/render/palette';
import { initRevelados, pintarFondoDatos, pintarMuestrasEscala } from './pagina';

const ramp = new ColorRamp(CARMIN);

initRevelados();
pintarFondoDatos(ramp);
pintarMuestrasEscala(ramp);
