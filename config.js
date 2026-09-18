/* ============================================================================
   CONFIG.JS
   ----------------------------------------------------------------------------
   ESTE É O ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR NO DIA A DIA.

   Aqui ficam: nome da empresa, logo, nome do evento, textos da tela,
   velocidade/voltas da roleta, sons e — o mais importante — a lista de
   prêmios com seus pesos (probabilidades).

   Não é necessário entender JavaScript para editar este arquivo. Basta
   seguir os exemplos e o guia rápido no README.md.
   ============================================================================ */

var CONFIG = {

  /* --------------------------------------------------------------------
     1. EMPRESA — logo exibido no cabeçalho e no centro da roleta
     -------------------------------------------------------------------- */
  company: {
    name: "LolPix",                   // usado no <title> e no alt do logo
    logo: "assets/logo.png",          // troque este arquivo pelo logo real
    logoHeight: 44,                   // altura do logo no cabeçalho (px)
    showLogo: true,                   // false = esconde o logo do cabeçalho
    showLogoInWheel: true,            // false = deixa o miolo da roleta liso, sem logo
  },

  /* --------------------------------------------------------------------
     2. EVENTO — texto exibido ao lado/abaixo do logo
     -------------------------------------------------------------------- */
  event: {
    name: "Roleta de Brindes",
    showName: true,                   // false = esconde o nome do evento
  },

  /* --------------------------------------------------------------------
     3. TEXTOS DA INTERFACE — troque tudo o que aparece na tela aqui
     -------------------------------------------------------------------- */
  texts: {
    dragHint: "Arraste a roleta para girar",
    dragHintWeak: "Deslize com um pouco mais de força",
    spinningHint: "Boa sorte...",
    spinButton: "GIRAR",
    spinningButton: "GIRANDO...",
    resultTitle: "PARABÉNS!",
    resultSubtitle: "Você ganhou:",
    newSpinButton: "NOVO GIRO",
    closeResultLabel: "Fechar",
    emptyStateTitle: "Roleta indisponível",
    emptyStateMessage: "Nenhum prêmio disponível no momento. Consulte o operador do evento.",
    fullscreenEnter: "Tela cheia",
    fullscreenExit: "Sair da tela cheia",
    footerNote: "",                   // texto opcional no rodapé (ex.: "Powered by ...")
  },

  /* --------------------------------------------------------------------
     4. COMO A ROLETA É ACIONADA
     --------------------------------------------------------------------
     mode:
       "drag"   -> o convidado arrasta/desliza a roleta (padrão)
       "button" -> volta o botão GIRAR clássico
       "both"   -> aceita os dois

     Em qualquer modo a roleta também gira com Enter/Espaço quando está
     selecionada pelo teclado (acessibilidade).
     -------------------------------------------------------------------- */
  interaction: {
    mode: "drag",
    minFlickSpeed: 0.30,     // força mínima do gesto (graus por milissegundo) para valer um giro
    spinsFromFlick: true,    // gesto mais forte = mais voltas
    maxExtraSpins: 5,        // teto de voltas extras ganhas pela força do gesto
  },

  /* --------------------------------------------------------------------
     5. COMPORTAMENTO DA ROLETA
     -------------------------------------------------------------------- */
  wheel: {
    spins: 6,                 // quantidade mínima de voltas completas antes de parar
    duration: 5200,           // duração total do giro, em milissegundos
    easing: "quart",          // "cubic" | "quart" | "expo"  (quanto maior, mais "peso" no final)
    segmentGap: true,         // true = desenha uma linha sutil entre os segmentos
  },

  /* --------------------------------------------------------------------
     6. SONS — coloque os arquivos em assets/sounds/
        Se um arquivo não existir, a aplicação simplesmente ignora o som
        (não quebra e não mostra erro para o usuário final).
     -------------------------------------------------------------------- */
  sounds: {
    enabled: true,
    volume: 0.55,             // 0 a 1
    files: {
      tick: "assets/sounds/tick.mp3",   // toca a cada segmento que passa
      win: "assets/sounds/win.mp3",     // toca quando o resultado aparece
    },
  },

  /* --------------------------------------------------------------------
     7. HISTÓRICO — salvo localmente no navegador (localStorage)
        Útil para o operador acompanhar os sorteios durante o evento.
     -------------------------------------------------------------------- */
  history: {
    enabled: true,
    storageKey: "roleta_brindes_historico_v1",
  },

  /* --------------------------------------------------------------------
     8. PAINEL ADMINISTRATIVO (discreto)
        Abre com o ícone de engrenagem (canto inferior esquerdo) ou com o
        atalho de teclado definido abaixo. Não é exibido ao público.
     -------------------------------------------------------------------- */
  admin: {
    enabled: true,
    shortcut: { ctrlKey: true, altKey: true, key: "a" }, // Ctrl + Alt + A
    pin: "",                  // defina algo como "1234" para exigir PIN. "" = sem PIN
  },

  /* --------------------------------------------------------------------
     9. CORES — paleta usada para colorir os segmentos automaticamente
        quando um prêmio não define sua própria cor.
     -------------------------------------------------------------------- */
  palette: ["#FCB238", "#1A1820", "#FFD08A", "#2A2630", "#E8861A", "#121017"],

  /* --------------------------------------------------------------------
     10. PRÊMIOS — o coração da configuração.
     --------------------------------------------------------------------

     Cada prêmio é um objeto com os campos:

       name    (texto)   - nome exibido no segmento e no resultado. Obrigatório.
       weight  (número)  - peso/probabilidade relativa. Quanto maior, mais chance.
       color   (texto)   - cor do segmento em hexadecimal. Opcional (usa a paleta acima se omitido).
       image   (texto)   - caminho de uma imagem opcional (assets/premios/...). Opcional.
       active  (boolean) - true/false. Prêmios inativos não entram no sorteio nem aparecem na roleta.
       stock   (número | null) - quantidade disponível. null = ilimitado.
                                  Quando chega a 0, o prêmio some automaticamente do sorteio.

     A probabilidade de cada prêmio é: peso do prêmio / soma de todos os pesos ativos.

     Para ADICIONAR um prêmio: copie um bloco { ... } e cole no array.
     Para REMOVER um prêmio: apague o bloco correspondente (ou mude "active" para false).
     Para ALTERAR a chance: mude apenas o número em "weight".
     -------------------------------------------------------------------- */
  prizes: [
    { name: "Copo Personalizado", weight: 50, color: "#FCB238", image: "", active: true, stock: null },
    { name: "Caneca",             weight: 30, color: "#1A1820", image: "", active: true, stock: null },
    { name: "Fone Bluetooth",     weight: 15, color: "#FFD08A", image: "", active: true, stock: null },
    { name: "Air Fryer",          weight: 4,  color: "#2A2630", image: "", active: true, stock: null },
    { name: "Smartphone",         weight: 1,  color: "#E8861A", image: "", active: true, stock: null },
  ],

};
