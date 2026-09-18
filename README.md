# Roleta de Brindes — Eventos

Roleta de sorteio de brindes com **sistema de probabilidades por peso**, feita em
HTML, CSS e JavaScript puro, com a identidade visual da LolPix (laranja
`#FCB238` e branco sobre fundo escuro). Não precisa de servidor, banco de dados nem
instalação: basta abrir o `index.html`.

---

## Como usar

1. Descompacte a pasta do projeto em qualquer lugar do computador.
2. Dê um duplo clique em **`index.html`**.
3. Pronto — a roleta abre no navegador.

> **Dica para o evento:** clique no ícone de tela cheia (canto inferior direito)
> ou pressione `F11` antes de começar. Use o navegador Chrome ou Edge atualizado.
> O convidado gira a roleta **arrastando com o dedo ou com o mouse** — não há
> botão a ser clicado.

Para publicar na internet (opcional), envie a pasta inteira para qualquer
hospedagem estática (Hostinger, Netlify, Vercel, GitHub Pages, ou o `public_html`
de uma hospedagem comum).

---

## Estrutura de arquivos

```text
/
├── index.html      ← estrutura da página (raramente precisa mexer)
├── style.css       ← aparência e cores
├── script.js       ← lógica do sorteio e animação (não precisa mexer)
├── config.js       ← ★ TUDO QUE VOCÊ PRECISA EDITAR ESTÁ AQUI ★
├── README.md
└── assets/
    ├── logo.png        ← logo da empresa
    ├── premios/        ← imagens dos prêmios (opcional)
    └── sounds/         ← efeitos sonoros (opcional)
```

**Regra de ouro: 95% das personalizações são feitas apenas no `config.js`.**

---

## Guia rápido de personalização

Tudo abaixo acontece dentro do arquivo **`config.js`**. Depois de salvar,
atualize a página no navegador (`F5`) para ver o resultado.

### Como a roleta é acionada

Por padrão **não existe botão**: o convidado gira a roleta arrastando com o
dedo (no celular/tablet) ou com o mouse (no notebook). Quanto mais forte o
gesto, mais voltas a roleta dá — e ela gira no sentido em que foi arrastada.

```javascript
interaction: {
  mode: "drag",          // "drag" | "button" | "both"
  minFlickSpeed: 0.30,   // força mínima do gesto para valer um giro
  spinsFromFlick: true,  // gesto mais forte = mais voltas
  maxExtraSpins: 5,      // teto de voltas extras
}
```

- **`mode: "drag"`** — só o gesto (padrão)
- **`mode: "button"`** — volta o botão GIRAR clássico, sem gesto
- **`mode: "both"`** — aceita os dois, útil quando a tela do evento não é sensível ao toque

Um toque leve ou um arrasto curto **não** conta como giro: a roleta apenas se
mexe um pouco e aparece o aviso "deslize com mais força". Isso evita sorteios
acidentais quando alguém só encosta na tela. Se quiser a roleta mais sensível,
diminua `minFlickSpeed` (ex.: `0.20`); para exigir um gesto mais decidido,
aumente (ex.: `0.45`).

Em qualquer modo a roleta também gira pelo teclado: `Tab` até ela e `Enter`.

> O gesto apenas **dispara** o giro. Quem escolhe o prêmio continua sendo o
> sorteio ponderado — não dá para "mirar" num prêmio arrastando de um jeito
> específico.

### Adicionar um prêmio

Copie uma linha existente dentro de `prizes: [ ... ]` e cole logo abaixo:

```javascript
prizes: [
  { name: "Copo Personalizado", weight: 50, color: "#6D4AFF", image: "", active: true, stock: null },
  { name: "Mochila",            weight: 10, color: "#3E2EA8", image: "", active: true, stock: null },  // ← novo prêmio
]
```

### Remover um prêmio

Apague a linha inteira dele — **ou**, se for temporário, mude `active: true`
para `active: false` (assim ele some da roleta mas continua no arquivo).

### Alterar a chance de cada prêmio

Mude apenas o número em `weight`. A chance é proporcional ao peso:

| Prêmio     | weight | Chance                |
| ---------- | ------ | --------------------- |
| Copo       | 50     | 50 ÷ 100 = **50%**    |
| Caneca     | 30     | 30 ÷ 100 = **30%**    |
| Fone       | 15     | 15 ÷ 100 = **15%**    |
| Air Fryer  | 4      | 4 ÷ 100 = **4%**      |
| Smartphone | 1      | 1 ÷ 100 = **1%**      |

Os pesos **não precisam somar 100**. Se você usar pesos 2, 1 e 1, as chances
serão 50%, 25% e 25%. A conta é feita automaticamente — e você pode conferir as
porcentagens já calculadas no painel administrativo.

### Trocar o logo

Substitua o arquivo `assets/logo.png` pelo logo da empresa (mantendo o mesmo
nome). Para usar outro nome ou ajustar o tamanho:

```javascript
company: {
  name: "Sua Empresa",
  logo: "assets/meu-logo.png",
  logoHeight: 44,          // altura do logo no cabeçalho (px)
  showLogo: true,          // false esconde o logo do cabeçalho
  showLogoInWheel: true,   // false deixa o miolo da roleta liso, sem logo
}
```

O mesmo arquivo aparece automaticamente no **centro da roleta** — a roleta gira
ao redor dele, mas o logo fica sempre parado e reto, como em uma roleta física.

### Alterar o nome do evento

```javascript
event: {
  name: "Confraternização Empresa X 2026",
  showName: true,      // false esconde o texto
}
```

### Alterar as cores

Há dois lugares:

**1. Cor de cada segmento** (em `config.js`): o campo `color` de cada prêmio.
Se você deixar `color` de fora, a cor sai automaticamente da paleta:

```javascript
palette: ["#6D4AFF", "#1B1F4B", "#FBA83C", "#3E2EA8", "#241966", "#4632B0"],
```

**2. Cores gerais da interface** (em `style.css`, no topo do arquivo):

```css
:root {
  --bg-deep: #0a090c;    /* fundo */
  --accent: #fcb238;     /* laranja LolPix: botão GIRAR, anel e destaques */
  --accent-soft: #ffd08a;
  --ink: #1a1820;        /* segmentos escuros */
  --white: #fbfaf8;      /* textos */
}
```

> O texto de cada segmento escolhe automaticamente entre branco e escuro,
> conforme o brilho da cor — então cores claras continuam legíveis.

### Ativar ou desativar o som

O projeto **já vem com os três efeitos sonoros prontos**, em `assets/sounds/`:

| Arquivo | Quando toca |
| --- | --- |
| `spin.wav` | ambiência grave em loop, durante o giro (entra e sai em fade) |
| `tick.mp3` | clique curto a cada segmento que passa pelo ponteiro |
| `win.mp3` | arpejo de sinos quando o prêmio é revelado |

Para ajustar:

```javascript
sounds: {
  enabled: true,     // false desliga todos os sons
  volume: 0.55,      // de 0 a 1
}
```

Quer trocar por outros sons? Basta substituir os arquivos mantendo os nomes, ou
apontar outros caminhos no bloco `sounds.files`.

> **Por que o som do giro é `.wav` e não `.mp3`?** O MP3 acrescenta alguns
> milissegundos de silêncio no início e no fim do arquivo. Como esse som toca em
> loop, isso criaria uma "batidinha" a cada repetição. O WAV não tem esse
> problema — e o arquivo tem só 90 KB.

**Se algum arquivo for apagado, a roleta continua funcionando normalmente, apenas
sem aquele som** (um aviso aparece no console, nada quebra).

### Alterar a duração e o número de voltas

```javascript
wheel: {
  spins: 6,          // voltas completas antes de desacelerar
  duration: 5200,    // duração total em milissegundos (5200 = 5,2 segundos)
  easing: "quart",   // "cubic" (mais suave) | "quart" | "expo" (freio mais seco)
}
```

### Imagens dos prêmios (opcional)

Coloque os arquivos em `assets/premios/` e referencie no prêmio:

```javascript
{ name: "Air Fryer", weight: 4, image: "assets/premios/airfryer.png", active: true, stock: null }
```

A imagem aparece na tela de resultado. Se o arquivo não existir, a roleta
continua funcionando e mostra apenas o nome do prêmio.

### Controle de estoque

Troque `stock: null` (ilimitado) por um número:

```javascript
{ name: "Smartphone", weight: 1, image: "", active: true, stock: 1 }
```

Quando o estoque chega a zero, o prêmio **sai automaticamente** da roleta e dos
sorteios seguintes. O estoque é contado por sessão (volta ao valor original se
a página for recarregada).

---

## Painel administrativo

Acesse de duas formas, ambas discretas — o convidado não vê nada disso:

- clique no **ícone de engrenagem** no canto inferior esquerdo; ou
- pressione **`Ctrl` + `Alt` + `A`**.

No painel você encontra:

- lista de prêmios com **peso e probabilidade já calculada em %**
- estoque de cada item
- botão para **ativar/desativar** um prêmio na hora (útil quando um brinde acaba)
- **total de giros** e prêmio mais sorteado
- **histórico** com horário de cada sorteio (salvo no navegador)

> Alterações feitas no painel valem apenas para a sessão atual. Para mudanças
> permanentes, edite o `config.js`.

Para proteger o painel com uma senha numérica:

```javascript
admin: {
  enabled: true,
  pin: "1234",     // deixe "" para não pedir PIN
}
```

---

## Como o sorteio funciona (importante)

A animação **não** decide o prêmio. A ordem é sempre esta:

1. O sistema sorteia o prêmio usando os pesos (`selectWeightedPrize`).
2. Descobre qual segmento corresponde a esse prêmio.
3. Calcula o ângulo exato de parada.
4. Anima a roleta até lá.

Por isso as probabilidades configuradas são respeitadas de verdade. As fatias
são desenhadas **todas do mesmo tamanho** de propósito: assim o convidado não
consegue deduzir as chances olhando a roleta.

---

## Atalhos e acessibilidade

| Ação                        | Como fazer                     |
| --------------------------- | ------------------------------ |
| Girar                       | arrastar a roleta, ou `Tab` até ela + `Enter` |
| Fechar o resultado          | `Esc`                          |
| Abrir/fechar painel admin   | `Ctrl` + `Alt` + `A` / `Esc`   |
| Tela cheia                  | botão no canto inferior direito |

A interface tem foco visível por teclado, textos alternativos nas imagens e
respeita a preferência de "movimento reduzido" do sistema operacional.

---

## Problemas comuns

| Situação | O que fazer |
| --- | --- |
| Arrastei e não girou | O gesto foi curto ou lento demais. Deslize com mais impulso, ou reduza `interaction.minFlickSpeed` no `config.js`. |
| Prefiro o botão de sempre | Troque para `interaction: { mode: "button" }` no `config.js`. |
| A roleta aparece vazia e a mensagem de indisponível surge | Todos os prêmios estão inativos, com peso 0 ou sem estoque. Abra o console (`F12`) — a mensagem indica exatamente qual prêmio tem problema. |
| Mudei o `config.js` e nada mudou | Salve o arquivo e atualize com `Ctrl` + `F5` (recarrega ignorando o cache). |
| O som não toca | Navegadores só liberam áudio depois de alguma interação do usuário na página — o primeiro clique em GIRAR já resolve. Verifique também `sounds.enabled` e o volume do sistema. |
| O logo não aparece | Confirme o nome/caminho do arquivo em `company.logo` e que ele está dentro de `assets/`. |
| As fontes parecem diferentes | As fontes vêm do Google Fonts. Sem internet, o navegador usa uma fonte alternativa — tudo continua funcionando. |

---

## Compatibilidade

Chrome, Edge, Firefox e Safari atualizados, em desktop, notebook, tablet e
celular. Funciona offline (exceto as fontes do Google, que são opcionais).
