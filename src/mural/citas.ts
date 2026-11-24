/**
 * El boton «Copiar cita» de las tarjetas de `#referencias`.
 *
 * La cita viaja en el `data-cita` del boton —la arma `citaPlana()` en el
 * build, asi que lo que se copia es exactamente lo que se lee en la pagina,
 * sin la cursiva— y el boton confirma dos segundos antes de volver a su
 * rotulo. El aviso para lector de pantalla va aparte, en el `role="status"`
 * de la tarjeta: cambiar el texto de un boton con `aria-label` no se anuncia.
 *
 * Lo enciende `initLanding()` en `main.ts`, como el resto de la pagina.
 */

/** Cuanto dura el «Copiado ✓» antes de que vuelva el rotulo. */
const AVISO_MS = 2000;

/**
 * Respaldo para cuando no hay portapapeles asincrono (contexto no seguro o
 * permiso negado): un campo fuera de pantalla y el comando viejo.
 */
function copiarAlViejoEstilo(texto: string): boolean {
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.cssText = 'position:fixed;top:-9999px;opacity:0';
  document.body.append(campo);
  campo.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}

async function copiar(texto: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Permiso negado o pagina sin foco: queda el respaldo.
    }
  }
  return copiarAlViejoEstilo(texto);
}

export function initCitas(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-cita]')) {
    const rotulo = btn.querySelector<HTMLElement>('[data-rotulo]');
    const estado = btn.closest('.ref-tarjeta')?.querySelector<HTMLElement>('[data-estado-cita]');
    if (!rotulo) continue;

    const original = rotulo.textContent ?? 'Copiar cita';
    let timer = 0;

    btn.addEventListener('click', async () => {
      const ok = await copiar(btn.dataset.cita ?? '');

      clearTimeout(timer);
      rotulo.textContent = ok ? 'Copiado ✓' : 'No se pudo copiar';
      btn.classList.toggle('copiado', ok);
      if (estado) estado.textContent = ok ? 'Cita copiada' : 'No se pudo copiar la cita';

      timer = window.setTimeout(() => {
        rotulo.textContent = original;
        btn.classList.remove('copiado');
        if (estado) estado.textContent = '';
      }, AVISO_MS);
    });
  }
}
