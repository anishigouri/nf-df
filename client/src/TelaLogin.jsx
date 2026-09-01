import { useState } from "react";

export default function TelaLogin({ onEntrar, erro }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");

  function enviar(e) {
    e.preventDefault();
    if (!login.trim() || !senha) return;
    onEntrar(login.trim(), senha);
  }

  return (
    <div className="cartao cartao-login">
      <h2 className="cartao-titulo">Entrar</h2>
      <p className="login-detalhe">Use o mesmo login e senha do ISS Online DF. Nada fica salvo em disco.</p>

      <form className="campo" onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="login">Login</label>
          <input
            id="login"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
          />
        </div>

        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        {erro && <div className="alerta">{erro}</div>}

        <button type="submit" className="botao botao-primario">
          Entrar
        </button>
      </form>
    </div>
  );
}
