/** Opção "Reduzir animações" (ADR-0048): só uma preferência de interface, sem dado pessoal. */
export const MOTION_STORAGE_KEY = 'hm.motion';
export const MOTION_REDUCED = 'reduced';

/**
 * Script inicial (9f, ADR-0055), com o nonce da CSP, no `<head>`: aplica a opção "Reduzir animações" ao `<html>`
 * antes da primeira pintura, para nada animar no instante entre a pintura e a hidratação. Só lê uma preferência
 * de interface; falha calada sem storage. Fora do módulo `'use client'`: o layout raiz (servidor) o importa.
 */
export const MOTION_INIT_SCRIPT = `try{if(localStorage.getItem('${MOTION_STORAGE_KEY}')==='${MOTION_REDUCED}')document.documentElement.dataset.motion='${MOTION_REDUCED}'}catch(e){}`;
