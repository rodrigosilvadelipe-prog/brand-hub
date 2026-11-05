const modulos = import.meta.glob('./clientes/*.json', { eager: true });

export const clientes = Object.values(modulos)
  .map((m) => m.default)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
