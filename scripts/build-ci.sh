#!/bin/sh
# =============================================================================
#  El build del deploy: que datos lleva cada despliegue
# =============================================================================
#
#  `PUBLIC_DATOS_SIMULADOS` la hornea Vite al compilar, no se lee en el
#  navegador, asi que el bundle de pruebas y el de produccion tienen que salir
#  de dos compilaciones distintas. Esto decide cual es cual.
#
#  Hay dos despliegues y una sola rama de codigo:
#
#      images-of-mexico            <- master,  registros reales de Supabase
#      images-of-mexico-simulado   <- test,    el banco de 1800, sin base
#
#  La regla, en orden:
#
#    1. Si CI dice que la rama es la de produccion -> simulados FUERA, pase lo
#       que pase. Se desactiva en vez de solo no activarse: si alguien deja la
#       variable puesta en el panel de produccion por error, no la contamina.
#    2. Si CI dice que es cualquier otra rama -> simulados dentro.
#    3. Si CI no dice nada —el proveedor no inyecto la rama, o esto corre en
#       una maquina— se respeta lo que venga del entorno o del `.env`.
#
#  El paso 3 es el que hace esto robusto. La primera version dependia solo de
#  `WORKERS_CI_BRANCH`, y si el proveedor no la inyecta, el build se cae al
#  lado seguro y el despliegue de pruebas sale sin banco. Ahora basta con
#  ponerle `PUBLIC_DATOS_SIMULADOS=true` en sus variables de build y funciona
#  aunque la deteccion de rama falle.
#
#  Produccion sigue protegida por el paso 1, y ademas no tiene esa variable
#  puesta: le haria falta que las dos cosas fallaran a la vez.
#
#  Build command en el panel:  npm run build:ci
# =============================================================================
set -e

RAMA_PRODUCCION=master

if [ "$WORKERS_CI_BRANCH" = "$RAMA_PRODUCCION" ]; then
  echo "build: rama '$WORKERS_CI_BRANCH' (produccion) -> solo registros reales"
  unset PUBLIC_DATOS_SIMULADOS
elif [ -n "$WORKERS_CI_BRANCH" ]; then
  echo "build: rama '$WORKERS_CI_BRANCH' -> con el banco simulado"
  export PUBLIC_DATOS_SIMULADOS=true
else
  echo "build: sin rama de CI -> se respeta el entorno (PUBLIC_DATOS_SIMULADOS=${PUBLIC_DATOS_SIMULADOS:-sin poner})"
fi

exec npx astro build
