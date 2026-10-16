'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ResetPasswordForm, VerifyEmailForm } from './AuthForms';

/**
 * Token de link de e-mail (verificação e redefinição; TM-01, ADR-0037). O link leva o token no fragmento
 * (`#token=`), que o navegador não envia ao servidor: não aparece nos logs da hospedagem nem em `Referer`.
 * Ao abrir, a página lê o token e limpa o endereço (`history.replaceState`), então ele também sai do
 * histórico. Links antigos com `?token=` continuam valendo (o servidor repassa `fromQuery`) e são limpos do
 * mesmo jeito. O token só é usado pelo formulário, por POST (scanners de e-mail não o consomem ao abrir).
 *
 * Devolve `undefined` antes de ler o endereço (primeira renderização), depois o token ou `null`.
 */
function useLinkToken(fromQuery: string | undefined): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  // Lido uma vez só: o endereço é limpo na primeira leitura (e o StrictMode roda o efeito duas vezes).
  const read = useRef<string | null>(null);
  useEffect(() => {
    if (read.current === null) {
      const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
      read.current = (fromHash || fromQuery || '').slice(0, 64);
    }
    const found = read.current;
    if (window.location.hash || window.location.search) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    // Leitura do endereço ao montar (fora do React): não há como derivar na renderização.
    setToken(/^[A-Za-z0-9_-]{43}$/.test(found) ? found : null);
  }, [fromQuery]);
  return token;
}

/**
 * Com token, `withToken` (título e texto, do servidor) e o formulário do link; sem token, `fallback`
 * (reenvio da verificação ou link para pedir outra redefinição).
 */
export function LinkTokenGate({
  kind,
  fromQuery,
  withToken,
  fallback,
}: {
  kind: 'verify' | 'reset';
  fromQuery?: string;
  withToken: ReactNode;
  fallback: ReactNode;
}) {
  const token = useLinkToken(fromQuery);
  if (token === undefined) return null;
  if (!token) return fallback;
  return (
    <>
      {withToken}
      {kind === 'verify' ? <VerifyEmailForm token={token} /> : <ResetPasswordForm token={token} />}
    </>
  );
}
