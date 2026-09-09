#!/bin/sh
# Ajusta el volumen y baja privilegios antes de arrancar.
#
# Un PaaS monta los volúmenes como root. Si el proceso ya corriera sin
# privilegios, no podría escribir en su punto de montaje y el fallo aparece tarde
# y disfrazado: el worker responde 500 al primer documento, no al arrancar.
#
# Por eso este script empieza como root, corrige el dueño y deja el proceso en
# manos del usuario sin privilegios. `exec` para que el servidor sea PID 1 y
# reciba las señales de parada.
set -e

DESTINO="${EECC_WORKER_ARTIFACT_ROOT:-/app/artifacts}"
mkdir -p "$DESTINO"

if [ "$(id -u)" = "0" ]; then
    chown -R eecc:eecc "$DESTINO"
    exec setpriv --reuid=eecc --regid=eecc --init-groups "$@"
fi

# Sin privilegios de root no hay nada que ajustar; se arranca tal cual.
exec "$@"
