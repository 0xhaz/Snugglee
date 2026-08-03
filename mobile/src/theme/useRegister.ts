/**
 * The two registers (design.md §5), as a hook rather than a convention.
 *
 *   shell  — parent choosing. Bright, friendly, higher contrast. S-01/02/09/16.
 *   player — child falling asleep. Dim, warm, low contrast. S-03.
 *
 * Made structural on purpose. If screens reach into `palette` directly, the
 * distinction erodes the first time someone is in a hurry — and the
 * progressive dim (CLI-22) depends on these being genuinely separate, because
 * it is the *transition between them*, not an effect layered on top.
 */
import { createContext, useContext } from 'react';

import { player, shell } from './tokens';

export type Register = typeof shell;

export const RegisterContext = createContext<Register>(shell);

export const useRegister = (): Register => useContext(RegisterContext);

export const registers = { shell, player } as const;
export type RegisterName = keyof typeof registers;
