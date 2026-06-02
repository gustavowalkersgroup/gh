/*
 * Sementes reais puxadas ao vivo do ClickUp (lista "Fluxo de tarefas" — Walkers - Equipe).
 * Usadas quando o jogo roda sem conexão com o ClickUp, pra já abrir populado
 * com o seu fluxo de verdade. Quando há token/servidor, estas são substituídas
 * pelos dados ao vivo.
 *
 * due = epoch em ms (ou null). Snapshot capturado em 2026-06-02.
 */
window.FA = window.FA || {};

FA.seedTasks = [
  { id: "86ahq4y6n", name: "✅ [S4] Reunião de encerramento e validação final", status: "a fazer", priority: "normal", due: 1782284400000, assignees: ["Vitor Fonseca", "Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4y6n" },
  { id: "86ahq4wdv", name: "[IMPLEMENTAÇÃO] Vint Mens Wear", status: "a fazer", priority: "high", due: 1782284400000, assignees: ["Vitor Fonseca", "Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4wdv" },
  { id: "86ahq4y3x", name: "🎓 [S4] Treinamento da equipe operacional do Guilherme", status: "a fazer", priority: "high", due: 1782198000000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4y3x" },
  { id: "86ahq4y13", name: "📚 [S4] Documentação técnica — manual replicável lojas 2 e 3", status: "a fazer", priority: "high", due: 1781938800000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4y13" },
  { id: "86ahq4xxw", name: "📈 [S4] Dashboard de KPIs e métricas", status: "a fazer", priority: "normal", due: 1781852400000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xxw" },
  { id: "86ahq4xpt", name: "💤 [S3] Fluxo de reativação de base inativa", status: "a fazer", priority: "high", due: 1781679600000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xpt" },
  { id: "86ahq4xrn", name: "📊 [S3] Análise da campanha Dia dos Namorados", status: "a fazer", priority: "normal", due: 1781334000000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xrn" },
  { id: "86ahq4xm5", name: "👋 [S3] Fluxo de onboarding automatizado de novos clientes", status: "a fazer", priority: "high", due: 1781334000000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xm5" },
  { id: "86ahq4xj8", name: "🔄 [S3] Sequências de follow-up e nutrição", status: "a fazer", priority: "high", due: 1781247600000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xj8" },
  { id: "86ahq4xdg", name: "🗓️ [S2] Campanha Dia dos Namorados — configurada e disparada", status: "a fazer", priority: "urgent", due: 1781074800000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xdg" },
  { id: "86ahq4xcc", name: "🛡️ [S2] Governança de disparos em massa", status: "a fazer", priority: "high", due: 1780729200000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xcc" },
  { id: "86ahq4xaq", name: "🏷️ [S2] Segmentação avançada da base", status: "a fazer", priority: "high", due: 1780729200000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4xaq" },
  { id: "86ahq4x8e", name: "📝 [S2] Submeter templates à Meta para aprovação", status: "a fazer", priority: "urgent", due: 1780556400000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4x8e" },
  { id: "86ahtkeq3", name: "ATIVAÇÃO DE NOVO CLIENTE - SHOP BAUMER", status: "fazendo", priority: "high", due: 1780513200000, assignees: ["Vitor Fonseca", "Gustavo Almeida", "Paulo Junior"], url: "https://app.clickup.com/t/86ahtkeq3" },
  { id: "86ahq4x21", name: "🏆 [QUICK WIN] Primeiro disparo segmentado via API sem bloqueio", status: "a fazer", priority: "urgent", due: 1780470000000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4x21" },
  { id: "86ahq4wz3", name: "📥 [S1] Importação da base de contatos (7.000 clientes via CSV)", status: "a fazer", priority: "urgent", due: 1780297200000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4wz3" },
  { id: "86ahadt0d", name: "[IMPLEMENTAÇÃO] - DIVINNAH GAIA", status: "a fazer", priority: "high", due: 1780038000000, assignees: ["Gustavo Almeida", "Vitor Fonseca"], url: "https://app.clickup.com/t/86ahadt0d" },
  { id: "86ahq4wwp", name: "📋 [S1] Enviar template CSV ao cliente e orientar exportação do ERP", status: "a fazer", priority: "urgent", due: 1779951600000, assignees: ["Gustavo Almeida"], url: "https://app.clickup.com/t/86ahq4wwp" },
  { id: "86ah3dm3p", name: "IMPLEMENTAÇÃO - Opala Joias", status: "fazendo", priority: "low", due: 1779692400000, assignees: ["Gustavo Almeida", "Gulinha Walker", "Paulo Junior", "Vitor Fonseca"], url: "https://app.clickup.com/t/86ah3dm3p" },
  { id: "86ah3dd33", name: "IMPLEMENTAÇÃO - NEUROFOOD", status: "a fazer", priority: "high", due: 1779692400000, assignees: ["Gustavo Almeida", "Gulinha Walker", "Vitor Fonseca", "Paulo Junior"], url: "https://app.clickup.com/t/86ah3dd33" },
  { id: "86ah3dagu", name: "IMPLEMENTAÇÃO - Wazzu", status: "a fazer", priority: "low", due: 1779692400000, assignees: ["Gustavo Almeida", "Gulinha Walker", "Vitor Fonseca", "Paulo Junior"], url: "https://app.clickup.com/t/86ah3dagu" },
  { id: "86ah3d432", name: "IMPLEMENTAÇÃO - ATOMO", status: "a fazer", priority: "normal", due: 1779692400000, assignees: ["Gustavo Almeida", "Gulinha Walker", "Paulo Junior", "Vitor Fonseca"], url: "https://app.clickup.com/t/86ah3d432" },
  { id: "86ah3cu4f", name: "IMPLEMENTAÇÃO - UNIFORMIZEEI", status: "fazendo", priority: "high", due: 1779692400000, assignees: ["Gustavo Almeida", "Gulinha Walker", "Paulo Junior", "Guilherme Pêgo"], url: "https://app.clickup.com/t/86ah3cu4f" },
  { id: "86ah3ctgw", name: "[IMPLEMENTAÇÃO] - VIENS PERFUMES", status: "a fazer", priority: "urgent", due: 1779692400000, assignees: ["Gustavo Almeida", "Gulinha Walker", "Paulo Junior", "Vitor Fonseca"], url: "https://app.clickup.com/t/86ah3ctgw" },
  { id: "86ah3cnbm", name: "IMPLEMENTAÇÃO - HIVEN", status: "fazendo", priority: "urgent", due: 1779692400000, assignees: ["Paulo Junior", "Vitor Fonseca", "Angelo Silva"], url: "https://app.clickup.com/t/86ah3cnbm" },
  { id: "86ah677b9", name: "🟢 SAC automático — FAQ recorrente", status: "fazendo", priority: "none", due: 1778828400000, assignees: [], url: "https://app.clickup.com/t/86ah677b9" },
  { id: "86ah676f0", name: "🤖 Agente de IA de SAC — identidade, tom de voz e personalidade", status: "fazendo", priority: "none", due: 1778828400000, assignees: [], url: "https://app.clickup.com/t/86ah676f0" },
  { id: "86ah674f9", name: "🔗 Mapeamento dos dados Konsist → Nextags via N8N", status: "fazendo", priority: "none", due: 1778828400000, assignees: [], url: "https://app.clickup.com/t/86ah674f9" },
  { id: "86ah67491", name: "⚙️ Estruturação e importação da base de pacientes", status: "bloqueio", priority: "none", due: 1778223600000, assignees: [], url: "https://app.clickup.com/t/86ah67491" },
  { id: "86ah673w8", name: "⚠️ Validação técnica da API Konsist", status: "bloqueio", priority: "none", due: 1778223600000, assignees: [], url: "https://app.clickup.com/t/86ah673w8" },
  { id: "86ah4wxxj", name: "Hiven Cosméticos — Plano de Automação WhatsApp & CRM", status: "a fazer", priority: "high", due: 1777359600000, assignees: ["Angelo Silva"], url: "https://app.clickup.com/t/86ah4wxxj" },
  { id: "86ahudtqr", name: "ATIVAÇÃO DE NOVO CLIENTE - LEVE DELIVERY", status: "a fazer", priority: "high", due: null, assignees: ["Vitor Fonseca", "Gustavo Almeida", "Paulo Junior"], url: "https://app.clickup.com/t/86ahudtqr" },
  { id: "86ahubvza", name: "ATIVAÇÃO DE NOVO CLIENTE - EXCLUSIVAEXS", status: "a fazer", priority: "high", due: null, assignees: ["Vitor Fonseca", "Gustavo Almeida", "Paulo Junior"], url: "https://app.clickup.com/t/86ahubvza" },
  { id: "86ahmnwta", name: "ATIVAÇÃO DE NOVO CLIENTE - Mania de Brasil", status: "a fazer", priority: "high", due: null, assignees: ["Vitor Fonseca", "Gustavo Almeida", "Paulo Junior"], url: "https://app.clickup.com/t/86ahmnwta" },
  { id: "86ahmzanf", name: "[IMPLEMENTAÇÃO] - ALTO GIRO", status: "fazendo", priority: "high", due: null, assignees: [], url: "https://app.clickup.com/t/86ahmzanf" },
  { id: "86ahjpxr2", name: "[IMPLEMENTAÇÃO] - VERDENA", status: "a fazer", priority: "high", due: null, assignees: [], url: "https://app.clickup.com/t/86ahjpxr2" },
  { id: "86ahtkkrg", name: "[IMPLEMENTAÇÃO] - MANIA DE BRASIL", status: "a fazer", priority: "high", due: null, assignees: [], url: "https://app.clickup.com/t/86ahtkkrg" },
  { id: "86ahmzbq5", name: "🔗 Integração com Shopify", status: "fazendo", priority: "none", due: null, assignees: [], url: "https://app.clickup.com/t/86ahmzbq5" },
  { id: "86ahjpz0t", name: "🤖 Agente de IA de Vendas", status: "fazendo", priority: "none", due: null, assignees: [], url: "https://app.clickup.com/t/86ahjpz0t" },
  { id: "86ahjpyxn", name: "🤖 Agente de IA de SAC / Atendimento", status: "fazendo", priority: "none", due: null, assignees: [], url: "https://app.clickup.com/t/86ahjpyxn" },
  { id: "86ahmzaxe", name: "🤖 Base de conhecimento estruturada para as IAs", status: "fazendo", priority: "none", due: null, assignees: [], url: "https://app.clickup.com/t/86ahmzaxe" },
];
