/** Registro de sono como a interface o recebe (serializável). Mesma forma para dados reais e de demo. */
export interface SleepRecord {
  id: string;
  /** Instantes ISO (UTC). */
  bedAt: string;
  wakeAt: string;
  /** Dia local do despertar (`YYYY-MM-DD`): o registro "conta" para esse dia. */
  day: string;
  /** Horários locais `HH:MM` no fuso da pessoa. */
  bedTime: string;
  wakeTime: string;
  quality: number | null;
  awakenings: number | null;
  /** Nota decifrada; `null` sem nota ou quando o texto não foi pedido. */
  note: string | null;
}
