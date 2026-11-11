import type { Zone } from '@core/zones/zoneMask';
import { pastelFor } from '@core/zones/zoneMask';
import { el, button } from './controls';

export interface ZonePanelCallbacks {
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onHover: (name: string | null) => void;
  onFocus: (name: string) => void;
}

/** Lista de zonas: renombrar, eliminar y conteo de registros asignados. */
export function renderZoneList(
  container: HTMLElement,
  zones: Map<string, Zone>,
  counts: Map<string, number>,
  selected: string | null,
  cb: ZonePanelCallbacks
): void {
  container.textContent = '';
  if (zones.size === 0) {
    container.append(el('p', { class: 'hint', text: 'Clic en una region del dibujo para crear una zona. Shift+clic agrega regiones a la zona seleccionada.' }));
    return;
  }

  for (const zone of zones.values()) {
    const swatch = el('i', { class: 'shrink-0 w-3 h-3 rounded-[3px]' });
    swatch.style.background = pastelFor(zone.hue, 1);

    const name = el('input', {
      class: 'zname flex-auto min-w-0 px-1 py-0.5 rounded-sm border border-transparent bg-transparent '
        + 'hover:border-line hover:bg-white focus:border-line focus:bg-white focus:outline-none',
      value: zone.name,
    });
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (v && v !== zone.name) cb.onRename(zone.name, v);
      else name.value = zone.name;
    });

    const n = counts.get(zone.name) ?? 0;
    const meta = el('span', {
      class: 'whitespace-nowrap text-2xs text-muted',
      text: `${zone.regions.length} reg · ${n} reg.`,
      title: `${zone.regions.length} regiones conexas, ${n} registros, ${zone.area} px`,
    });

    // La zona elegida se lava con el acento; el resto solo responde al hover.
    const item = el('div', {
      class: 'flex items-center gap-1.5 px-1 py-[3px] rounded-sm cursor-pointer '
        + (selected === zone.name
          ? 'bg-tint-sel outline outline-accent'
          : 'hover:bg-tint'),
    }, [
      swatch, name, meta,
      button('x', () => cb.onDelete(zone.name), 'mini danger'),
    ]);
    item.addEventListener('mouseenter', () => cb.onHover(zone.name));
    item.addEventListener('mouseleave', () => cb.onHover(null));
    item.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') cb.onFocus(zone.name);
    });
    container.append(item);
  }
}
