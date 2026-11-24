/**
 * El script de `/historia`: el relato de donde sale la figura del mural
 * —la visualizacion de datos, el mito de Quetzalcoatl y la dieta de la milpa.
 *
 * La pagina es texto y fotos, asi que aqui no entra nada del motor de
 * acuarela: ni el dibujo, ni las zonas, ni el CSV, ni el `localStorage`. Solo
 * las dos cosas que la pagina necesita del mural y que viven en `./pagina`:
 * el revelado de los bloques con el scroll y los fragmentos de red del fondo
 * de «Visualización de datos». El relevo de las fotos de la milpa es CSS
 * puro (ver `mural.css`) y no necesita a nadie.
 *
 * Por eso tiene entrada propia y no comparte la de `/`: importar `./main`
 * aqui arrastraria el motor entero y montaria el kiosco en el `<body>` —su
 * punto de anclaje, `#mural-mount`, no existe en esta ruta.
 */
import { CARMIN, ColorRamp } from '@core/render/palette';
import { initRevelados, pintarFondoDatos } from './pagina';

initRevelados();
pintarFondoDatos(new ColorRamp(CARMIN));
