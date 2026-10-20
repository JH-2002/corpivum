/**
 * Limite por IP do que é público e não tem conta (TM-03, ADR-0037): o demo e as server actions chamadas sem
 * sessão (período, modo privacidade, apresentação, telas de conta). Barra abuso barato antes do trabalho de
 * renderização; não substitui os limites no banco do login, cadastro e recuperação (LEG-S05), nem o limite
 * da hospedagem (7e).
 *
 * Janela fixa em memória de cada instância: sem banco (o demo não acessa o banco) e sem dependência nova.
 * O IP fica só na memória, durante a janela; nunca vai para log, banco ou resposta. Com muitas chaves, as
 * mais antigas saem primeiro (o limite falha aberto, nunca bloqueia todo mundo).
 */
export interface Throttle {
  /** Conta uma requisição da chave; `false` quando passou do limite da janela. */
  hit(key: string, now: number): boolean;
  /** Quantas chaves (IPs) estão na memória. Só para teste. */
  size(): number;
}

export function createThrottle(opts: { windowMs: number; max: number; maxKeys: number }): Throttle {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = 0;
  return {
    hit(key, now) {
      // Uma vez por janela, apaga as janelas vencidas: o IP não fica na memória além de ~2 janelas enquanto a
      // instância recebe acessos (aviso da demo, ADR-0043).
      if (now - lastSweep >= opts.windowMs) {
        lastSweep = now;
        for (const [k, w] of windows) {
          if (now - w.start >= opts.windowMs) windows.delete(k);
        }
      }
      const current = windows.get(key);
      if (current && now - current.start < opts.windowMs) {
        current.count += 1;
        return current.count <= opts.max;
      }
      if (current) windows.delete(key);
      if (windows.size >= opts.maxKeys) {
        for (const [k, w] of windows) {
          if (now - w.start >= opts.windowMs) windows.delete(k);
        }
        // Ainda cheio: sai a chave mais antiga (ordem de inserção do Map).
        const oldest = windows.keys().next();
        if (windows.size >= opts.maxKeys && !oldest.done) windows.delete(oldest.value);
      }
      windows.set(key, { start: now, count: 1 });
      return true;
    },
    size: () => windows.size,
  };
}

/** Por minuto e por IP. O demo inclui os prefetches da navegação; as actions sem sessão são poucas por tela. */
export const PUBLIC_LIMITS = {
  demo: { windowMs: 60_000, max: 300, maxKeys: 10_000 },
  anonymousAction: { windowMs: 60_000, max: 60, maxKeys: 10_000 },
} as const;

/** Endereços da própria máquina: fora de produção, o e2e e o desenvolvimento não são limitados. */
export function isLoopback(ip: string): boolean {
  return ip === 'local' || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
