#!/bin/sh
# =============================================================================
#  El build de Cloudflare Workers: que datos lleva cada rama
# =============================================================================
#
#  `PUBLIC_DATOS_SIMULADOS` la hornea Vite al compilar, no se lee en el
#  navegador. Por eso la separacion de entornos que trae Workers Builds no
#  sirve para esto: sus variables de preview son de *runtime*, y las de build
#  —dice la documentacion— «will not be accessible at runtime» y no tienen
#  override por entorno. Una sola casilla en el panel no puede dar dos
#  bundles distintos.
#
#  La salida es `WORKERS_CI_BRANCH`, que Workers Builds inyecta con el nombre
#  de la rama justo para esto («customizing build based on branch»). Asi la
#  regla vive aqui, versionada y revisable en un diff, y no en una casilla del
#  panel que nadie recuerda haber marcado.
#
#      master          -> solo registros reales
#      cualquier otra  -> con el banco simulado
#
#  Produccion es la excepcion explicita y todo lo demas lleva simulados: si
#  manana aparece una rama nueva, lo peor que pasa es que su preview salga con
#  gente ficticia. Al reves —produccion estrenando mil ochocientas personas
#  inventadas— no se nota y es mentira.
#
#  Uso en el panel del Worker, como Build command:  npm run build:ci
# =============================================================================
set -e

RAMA_PRODUCCION=master

if [ -n "$WORKERS_CI_BRANCH" ] && [ "$WORKERS_CI_BRANCH" != "$RAMA_PRODUCCION" ]; then
  echo "build: rama '$WORKERS_CI_BRANCH' -> con el banco simulado"
  export PUBLIC_DATOS_SIMULADOS=true
else
  # Se desactiva a proposito y no solo «no se activa»: si alguien deja la
  # variable puesta en el panel, esto impide que produccion salga con gente
  # inventada. En local no estorba, porque ahi el valor viene del `.env`, que
  # Vite lee por su cuenta.
  echo "build: rama '${WORKERS_CI_BRANCH:-local}' -> solo registros reales"
  unset PUBLIC_DATOS_SIMULADOS
fi

exec npx astro build
