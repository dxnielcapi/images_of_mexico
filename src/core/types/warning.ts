export interface Warning {
  kind: 'zona-inexistente' | 'checksum' | 'zona-id' | 'valor' | 'id-generado' | 'sin-lugar';
  id: string;
  message: string;
}
