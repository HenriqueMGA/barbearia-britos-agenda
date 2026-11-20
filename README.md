# Painel do barbeiro · Barbearia Britos

Painel interno em que os barbeiros da Britos acompanham e gerenciam a agenda: os agendamentos feitos pelo site, os horários livres e as folgas.

É um site estático (HTML, CSS e JavaScript puro, sem framework e sem etapa de build) que conversa com o backend da barbearia pela API.

## Páginas

| Página | O que faz |
|---|---|
| `index.html` (Agenda do dia) | Horários de um dia: atendimentos, horários livres e folgas. Mostra resumo (quantidade, receita prevista, próximo cliente), filtros e a faixa da semana. Cada atendimento pode ser editado, removido ou chamado no WhatsApp. |
| `calendario.html` (Calendário) | Visão do mês com a ocupação de cada dia. Ao clicar num dia, mostra os agendamentos dele. |
| `folgas.html` (Folgas) | Marca, edita e remove folgas: algumas horas, um dia inteiro ou vários dias. Antes de salvar, avisa se há clientes marcados no período. |

Os dados se atualizam sozinhos a cada minuto, então um agendamento feito no site aparece no painel sem recarregar a página.

## Como rodar no computador

1. Ligue o backend local, que atende em `http://localhost:3000`.
2. Abra o `index.html` no navegador. Pode ser direto pelo arquivo ou por um servidor local, como a extensão Live Server do VS Code.

Quando o painel roda no computador (`localhost`, `127.0.0.1` ou aberto como arquivo), ele usa o backend local. Publicado em outro endereço, usa o backend da Vercel:

```
https://barbearia-britos-back.vercel.app
```

Para apontar para outro backend, defina `window.BRITOS_API` antes de carregar o `js/script.js`:

```html
<script>window.BRITOS_API = "https://outro-backend.exemplo.com";</script>
<script src="js/script.js" defer></script>
```

## Antes de publicar

- **CORS do backend.** Hoje o backend da Vercel só aceita requisições de `https://barbearia-britos.vercel.app`. O endereço onde o painel for publicado precisa ser incluído na lista de origens permitidas do backend. Sem isso, o navegador bloqueia as requisições e o painel mostra "Não foi possível carregar os agendamentos".
- **Login.** As rotas ainda não têm autenticação. Qualquer pessoa com o endereço do backend consegue ver os nomes e telefones dos clientes e mudar agendamentos e folgas. Por causa da LGPD, o painel e as rotas precisam de login antes de entrar em uso.
- **Busca de páginas.** As páginas já têm `noindex, nofollow`, então não aparecem no Google.

## Estrutura

```
index.html           Agenda do dia
calendario.html      Calendário do mês
folgas.html          Folgas
css/
  style.css          Estilos comuns (cores, fontes, cabeçalho, botões, listas, formulários)
  agenda.css         Só da agenda
  calendario.css     Só do calendário
  folgas.css         Só das folgas
js/
  script.js          Código comum: comunicação com a API, dados, janela de edição
  agenda.js          Só da agenda
  calendario.js      Só do calendário
  folgas.js          Só das folgas
img/
  emblema-branco.png     Emblema da marca (logo e ícone da aba)
  apple-touch-icon.png   Ícone ao salvar o painel na tela inicial do iPhone
  icone-192.png, icone-512.png   Ícones do app instalado (Android e computador)
fonts/
  big-shoulders-display.woff2, montserrat.woff2   Fontes hospedadas no projeto (licença OFL)
  *-OFL.txt              Textos da licença das fontes (obrigatórios ao redistribuí-las)
manifest.webmanifest     Dados do app instalável (nome, cores, ícones)
sw.js                    Service worker: deixa o painel instalável e abrindo sem internet
```

Cada página carrega primeiro o `js/script.js` e depois o script dela. Essa ordem importa: o script da página usa o que o `script.js` coloca em `window.Britos`.

## Ao publicar uma nova versão

- **Mudou CSS ou JavaScript?** Aumente o número do `?v=` nos `<link>` e `<script>` das três páginas, por exemplo de `?v=2` para `?v=3`. Assim o navegador baixa a versão nova em vez de usar a guardada.
- **Mudou o `sw.js`?** Troque também o `VERSAO` dentro dele, para os celulares descartarem a cópia antiga.

## Desempenho

- **Só o período em uso:** o painel busca os agendamentos e as folgas do mês na tela, com uma semana a mais de cada lado, e não o histórico todo. Os serviços são buscados uma vez por página.
- **Atualização automática:** acontece a cada minuto, e só com a página visível. Com a aba em segundo plano ou o celular bloqueado, não gasta bateria nem dados, e ao voltar atualiza na hora.
- **Indicador de atualização:** a tela mostra "Atualizado às HH:MM". Sem conexão, avisa que os dados na tela são antigos.
- **Fontes:** são hospedadas no projeto, com preload, sem depender do Google Fonts.
- **App instalável:** no Android e no computador, o navegador oferece "Instalar app". No iPhone, use "Compartilhar → Adicionar à Tela de Início". Sem internet, o app abre, mas avisa que não conseguiu buscar os dados. Os dados dos clientes nunca ficam guardados no aparelho.

## Rotas da API usadas

| Método | Rota | Uso no painel |
|---|---|---|
| GET | `/api/agendamentos?de=&ate=` | Agendamentos do período na tela (se o backend ignorar o filtro, o painel filtra) |
| PATCH | `/api/agendamentos/:id` | Editar agendamento (só os campos que mudaram) |
| DELETE | `/api/agendamentos/:id` | Remover agendamento |
| GET | `/api/servicos` | Preço e duração de cada serviço |
| GET | `/api/barbeiros?servico=<id>` | Barbeiros que fazem o serviço |
| GET | `/api/horarios-disponiveis?data=&servico=&barbeiro=` | Horários livres ao editar um agendamento |
| GET | `/api/folgas?de=&ate=` | Folgas do período na tela (aceita também `barbeiro`) |
| POST | `/api/folgas` | Marcar folga |
| PATCH | `/api/folgas/:id` | Editar folga |
| DELETE | `/api/folgas/:id` | Remover folga |

Os erros do backend chegam como `{ "error": "mensagem" }`, e o painel mostra essa mensagem ao barbeiro.

## Configurações que estão no código

Ficam no início do `js/script.js`:

- **Expediente:** das 09:00 às 21:00, em blocos de 30 minutos (`ABRE`, `FECHA`, `PASSO`). Precisa bater com a grade do backend.
- **Domingo:** fechado. Os botões "Hoje" e as navegações pulam para segunda.

## Visual

Segue a identidade do site da Britos: grafite e "papel" (`#0c0d0e`, `#26282b`, `#f2f3f3`), títulos em Big Shoulders Display, textos em Montserrat, o emblema do barbudo e o divisor de triângulos invertidos. O layout funciona a partir de 320px de largura, com contraste e áreas de toque dentro das recomendações do WCAG.
