import { Fragment, useEffect, useRef, useState } from "react";

import TelaLogin from "./TelaLogin.jsx";

const CHAVE_SESSAO = "nfdf_credenciais";

const ETAPAS = [
  { chave: "upload", rotulo: "Enviar" },
  { chave: "configurar", rotulo: "Configurar" },
  { chave: "rodando", rotulo: "Processar" },
  { chave: "concluido", rotulo: "Concluído" },
];

function Icone({ children, tamanho = 20, ...props }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

const IconeRaio = (props) => (
  <Icone {...props}>
    <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
  </Icone>
);
const IconeUpload = (props) => (
  <Icone {...props}>
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
  </Icone>
);
const IconeCheck = (props) => (
  <Icone {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icone>
);
const IconeX = (props) => (
  <Icone {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icone>
);
const IconeDownload = (props) => (
  <Icone {...props}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </Icone>
);
const IconeRefazer = (props) => (
  <Icone {...props}>
    <path d="M3 12a9 9 0 1 1 3 6.7" />
    <path d="M3 21v-6h6" />
  </Icone>
);
const IconeSair = (props) => (
  <Icone {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </Icone>
);

function lerCredenciaisSalvas() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

const ROTULO_STATUS = { rodando: "Rodando", ok: "OK", erro: "Erro" };

function Badge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      {status === "rodando" && <span className="spinner" />}
      {status === "ok" && <IconeCheck tamanho={11} />}
      {status === "erro" && <IconeX tamanho={11} />}
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

export default function App() {
  const [credenciais, setCredenciais] = useState(lerCredenciaisSalvas);
  const [erroLogin, setErroLogin] = useState(null);
  const [etapa, setEtapa] = useState("upload"); // upload -> configurar -> rodando -> concluido
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [job, setJob] = useState(null); // { id, totalPendentes }
  const [dryRun, setDryRun] = useState(true);
  const [limite, setLimite] = useState("");
  const [totalRodada, setTotalRodada] = useState(0);
  const [statusJob, setStatusJob] = useState("aguardando");
  const [mensagemFase, setMensagemFase] = useState("");
  const [linhas, setLinhas] = useState([]);
  const [erroFatal, setErroFatal] = useState(null);
  const inputArquivoRef = useRef(null);

  useEffect(() => {
    if (etapa !== "rodando" || !job) return;

    const fonte = new EventSource(`/api/jobs/${job.id}/eventos`);

    fonte.addEventListener("snapshot", (e) => {
      const dados = JSON.parse(e.data);
      if (dados.credenciaisInvalidas) {
        voltarParaLoginComErro(dados.erroFatal);
        return;
      }
      setStatusJob(dados.status);
      setMensagemFase(dados.mensagemFase ?? "");
      setLinhas(dados.linhas);
      setErroFatal(dados.erroFatal);
      if (dados.status === "concluido" || dados.status === "erro") setEtapa("concluido");
    });

    fonte.addEventListener("progresso", (e) => {
      const evento = JSON.parse(e.data);
      switch (evento.tipo) {
        case "fase":
          setMensagemFase(evento.mensagem);
          break;
        case "linha_inicio":
          setLinhas((prev) => [...prev, { numeroLinha: evento.numeroLinha, cliente: evento.cliente, status: "rodando" }]);
          break;
        case "linha_resultado":
          setLinhas((prev) =>
            prev.map((l) =>
              l.numeroLinha === evento.numeroLinha
                ? { ...l, status: evento.status, resultado: evento.resultado, erro: evento.erro }
                : l
            )
          );
          break;
        case "erro_fatal":
          if (evento.credenciaisInvalidas) {
            voltarParaLoginComErro(evento.mensagem);
          } else {
            setErroFatal(evento.mensagem);
            setStatusJob("erro");
          }
          break;
      }
    });

    return () => fonte.close();
  }, [etapa, job]);

  function entrar(login, senha) {
    const dados = { login, senha };
    setCredenciais(dados);
    setErroLogin(null);
    try {
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(dados));
    } catch {
      // sessionStorage indisponivel (ex.: aba anonima com bloqueio) -- segue so em memoria
    }
  }

  function sair() {
    setCredenciais(null);
    try {
      sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      // ver comentario em entrar()
    }
    recomecar();
  }

  function voltarParaLoginComErro(mensagem) {
    setCredenciais(null);
    try {
      sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      // ver comentario em entrar()
    }
    setErroLogin(mensagem);
    recomecar();
  }

  async function processarArquivo(arquivo) {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      const formData = new FormData();
      formData.append("planilha", arquivo);
      const resp = await fetch("/api/upload", { method: "POST", body: formData });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro ?? "Falha no upload.");

      setJob({ id: dados.jobId, totalPendentes: dados.totalPendentes });
      setEtapa("configurar");
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function iniciarProcessamento() {
    setErro(null);
    const calculado = limite ? Math.min(job.totalPendentes, Number(limite)) : job.totalPendentes;
    setTotalRodada(calculado);
    try {
      const resp = await fetch(`/api/jobs/${job.id}/iniciar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limite: limite ? Number(limite) : null,
          dryRun,
          login: credenciais.login,
          senha: credenciais.senha,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro ?? "Falha ao iniciar o processamento.");
      setEtapa("rodando");
    } catch (err) {
      setErro(err.message);
    }
  }

  function recomecar() {
    setEtapa("upload");
    setErro(null);
    setJob(null);
    setDryRun(true);
    setLimite("");
    setTotalRodada(0);
    setStatusJob("aguardando");
    setMensagemFase("");
    setLinhas([]);
    setErroFatal(null);
  }

  const indiceEtapa = ETAPAS.findIndex((e) => e.chave === etapa);
  const concluidas = linhas.filter((l) => l.status === "ok").length;
  const comErro = linhas.filter((l) => l.status === "erro").length;
  const processadas = concluidas + comErro;
  const percentual = totalRodada ? Math.min(100, Math.round((processadas / totalRodada) * 100)) : 0;

  return (
    <>
      <div className="fundo-aurora" />
      <div className="grade-ruido" />

      <main className="pagina">
        <div className="topo">
          <div className="logo">
            <IconeRaio tamanho={22} stroke="white" />
          </div>
          <h1>NFS-e · ISS Online DF</h1>
          {credenciais && (
            <button type="button" className="botao botao-fantasma botao-sair topo-acoes" onClick={sair}>
              <IconeSair tamanho={14} />
              Sair
            </button>
          )}
        </div>
        <p className="subtitulo">Lançamento automático de notas a partir da planilha de controle.</p>

        {!credenciais && <TelaLogin onEntrar={entrar} erro={erroLogin} />}

        {credenciais && (
          <>
        <nav className="stepper">
          {ETAPAS.map((e, i) => (
            <Fragment key={e.chave}>
              <div className={`stepper-item ${i === indiceEtapa ? "ativo" : i < indiceEtapa ? "feito" : ""}`}>
                <div className="stepper-bolha">{i < indiceEtapa ? <IconeCheck tamanho={14} /> : i + 1}</div>
                <span className="stepper-rotulo">{e.rotulo}</span>
              </div>
              {i < ETAPAS.length - 1 && <div className={`stepper-linha ${i < indiceEtapa ? "feita" : ""}`} />}
            </Fragment>
          ))}
        </nav>

        {erro && (
          <div className="alerta">
            <IconeX tamanho={16} />
            {erro}
          </div>
        )}

        {etapa === "upload" && (
          <div
            className={`cartao dropzone ${arrastando ? "arrastando" : ""} ${enviando ? "enviando" : ""}`}
            onClick={() => inputArquivoRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              processarArquivo(e.dataTransfer.files?.[0]);
            }}
          >
            <div className="dropzone-icone">
              <IconeUpload tamanho={26} stroke="white" />
            </div>
            <div className="dropzone-titulo">
              {enviando ? "Enviando planilha..." : "Arraste sua planilha aqui"}
            </div>
            <div className="dropzone-detalhe">ou clique para selecionar um arquivo .xlsx</div>
            <input
              ref={inputArquivoRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => processarArquivo(e.target.files?.[0])}
            />
          </div>
        )}

        {etapa === "configurar" && job && (
          <div className="cartao">
            <h2 className="cartao-titulo">Configurar processamento</h2>

            {job.totalPendentes === 0 ? (
              <p className="fase">Nenhuma nota pendente encontrada nessa planilha (coluna NOTA já preenchida).</p>
            ) : (
              <>
                <p className="fase">
                  <strong style={{ color: "var(--text)" }}>{job.totalPendentes}</strong> nota(s) pendente(s)
                  encontrada(s) na planilha.
                </p>

                <div className="linha-toggle">
                  <div className="linha-toggle-texto">
                    <span className="linha-toggle-titulo">Modo dry-run</span>
                    <span className="linha-toggle-detalhe">Preenche o formulário mas não grava a nota</span>
                  </div>
                  <button
                    type="button"
                    className={`toggle ${dryRun ? "ligado" : ""}`}
                    onClick={() => setDryRun((v) => !v)}
                    aria-pressed={dryRun}
                  >
                    <span className="toggle-bolinha" />
                  </button>
                </div>

                <div className="campo">
                  <label htmlFor="limite">Limite de notas (vazio = todas)</label>
                  <input
                    id="limite"
                    type="number"
                    min="1"
                    placeholder="todas"
                    value={limite}
                    onChange={(e) => setLimite(e.target.value)}
                  />
                </div>

                <button type="button" className="botao botao-primario" onClick={iniciarProcessamento}>
                  <IconeRaio tamanho={16} />
                  Iniciar processamento
                </button>
              </>
            )}

            <button type="button" className="botao botao-fantasma" onClick={recomecar}>
              <IconeRefazer tamanho={15} />
              Trocar planilha
            </button>
          </div>
        )}

        {(etapa === "rodando" || etapa === "concluido") && (
          <div className="cartao">
            <div className="progresso-topo">
              <div className="progresso-numero">
                {processadas}
                <span> / {totalRodada || "…"}</span>
              </div>
              <div className="fase">
                {statusJob === "rodando" && <span className="ponto-pulsando" />}
                {mensagemFase || (statusJob === "rodando" ? "Processando..." : "")}
              </div>
            </div>
            <div className="barra-progresso">
              <div className="barra-progresso-preenchimento" style={{ width: `${percentual}%` }} />
            </div>

            <div className="stats">
              <div className="stat">
                <span className="stat-valor">{totalRodada || 0}</span>
                <span className="stat-rotulo">Total</span>
              </div>
              <div className="stat">
                <span className="stat-valor ok">{concluidas}</span>
                <span className="stat-rotulo">OK</span>
              </div>
              <div className="stat">
                <span className="stat-valor erro">{comErro}</span>
                <span className="stat-rotulo">Erros</span>
              </div>
            </div>

            {erroFatal && (
              <div className="alerta">
                <IconeX tamanho={16} />
                {erroFatal}
              </div>
            )}

            <div className="lista-linhas">
              {linhas.map((l) => (
                <div className="item-linha" key={l.numeroLinha}>
                  <span className="item-linha-numero">#{l.numeroLinha}</span>
                  <div className="item-linha-info">
                    <span className="item-linha-cliente">{l.cliente}</span>
                    {(l.resultado || l.erro) && (
                      <span className="item-linha-detalhe">{l.status === "erro" ? l.erro : l.resultado}</span>
                    )}
                  </div>
                  <Badge status={l.status} />
                </div>
              ))}
            </div>

            {etapa === "concluido" && !erroFatal && (
              <div className="banner-sucesso">
                <IconeCheck tamanho={18} />
                Processamento concluído com sucesso.
              </div>
            )}

            {etapa === "concluido" && (
              <div className="acoes-finais">
                <a className="botao botao-primario" href={`/api/jobs/${job.id}/planilha`}>
                  <IconeDownload tamanho={16} />
                  Baixar planilha atualizada
                </a>
                <button type="button" className="botao botao-fantasma" onClick={recomecar}>
                  <IconeRefazer tamanho={15} />
                  Processar outra planilha
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}

        <p className="rodape">Robô interno · ISS Online DF · uso restrito</p>
      </main>
    </>
  );
}
