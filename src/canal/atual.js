// Canal ativo (singleton) para ferramentas/rotinas que precisam enviar mensagens a terceiros.
let _canal = null;
export const setCanal = (c) => { _canal = c; };
export const getCanal = () => { if (!_canal) throw new Error('canal não inicializado'); return _canal; };
