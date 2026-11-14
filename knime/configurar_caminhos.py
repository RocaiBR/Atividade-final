"""Aponta os nós do workflow do KNIME para a pasta data/ deste projeto.

O conector SQLite do KNIME só aceita caminho absoluto, então os seis nós que
leem ou gravam arquivos usam o caminho completo da pasta data/. Rode este
script sempre que o projeto mudar de pasta ou de computador:

    python knime/configurar_caminhos.py

Para corrigir também uma cópia importada no workspace do KNIME, passe a pasta
dela (feche o workflow no KNIME antes, sem salvar):

    python knime/configurar_caminhos.py "C:/Users/voce/knime-workspace/fenty_consolidacao"

No fim, o script gera de novo knime/fenty_consolidacao.knwf.
"""
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

KNIME = Path(__file__).resolve().parent
WORKFLOW = KNIME / "fenty_consolidacao"
DADOS = KNIME.parent / "data"

# Mesmos arquivos de backend/app/config.py
ARQUIVOS = {
    "CSV Reader (#3)": DADOS / "staging" / "perfis_sensoriais.csv",
    "CSV Reader (#4)": DADOS / "staging" / "feedbacks.csv",
    "CSV Reader (#5)": DADOS / "staging" / "clima_diario.csv",
    "CSV Writer (#9)": DADOS / "consolidado" / "fato_atendimentos.csv",
    "Excel Writer (#26)": DADOS / "consolidado" / "fenty_atendimentos.xlsx",
}
BANCO = ("SQLite Connector (#1)", DADOS / "fenty_operacional.sqlite")


def _valor(caminho: Path) -> str:
    return escape(str(caminho), {'"': "&quot;"})


def _trocar(texto: str, padrao: str, novo: str, onde: str) -> str:
    texto, n = re.subn(padrao, lambda _: novo, texto)
    if n != 1:
        raise SystemExit(f"{onde}: esperava 1 ocorrência de {padrao!r}, achei {n}.")
    return texto


def configurar(workflow: Path) -> None:
    for no, arquivo in ARQUIVOS.items():
        settings = workflow / no / "settings.xml"
        texto = settings.read_text(encoding="utf-8")
        # Bloco do caminho: sistema de arquivos local + caminho absoluto
        # O KNIME grava "/>" sem espaço; os arquivos deste projeto, com espaço
        bloco = re.search(
            r'(?P<recuo>[ \t]*)<entry key="file_system_type" type="xstring" value="[^"]*"\s*/>\s*'
            r'(?:<entry key="file_system_specifier" type="xstring" value="[^"]*"\s*/>\s*)?'
            r'<entry key="path" type="xstring" value="[^"]*"\s*/>',
            texto,
        )
        if not bloco:
            raise SystemExit(f"{settings}: bloco do caminho não encontrado.")
        recuo = bloco.group("recuo")
        novo = (f'{recuo}<entry key="file_system_type" type="xstring" value="LOCAL" />\n'
                f'{recuo}<entry key="path" type="xstring" value="{_valor(arquivo)}" />')
        texto = texto[:bloco.start()] + novo + texto[bloco.end():]
        texto = _trocar(texto,
                        r'<entry key="convenience_fs_category" type="xstring" value="[^"]*"\s*/>',
                        '<entry key="convenience_fs_category" type="xstring" value="LOCAL" />',
                        settings)
        settings.write_text(texto, encoding="utf-8")
        print(f"  {no:<22} -> {arquivo}")

    no, banco = BANCO
    settings = workflow / no / "settings.xml"
    texto = settings.read_text(encoding="utf-8")
    texto = _trocar(texto, r'<entry key="locationType" type="xstring" value="[^"]*"\s*/>',
                    '<entry key="locationType" type="xstring" value="PATH" />', settings)
    texto = _trocar(texto, r'<entry key="dbPath" type="xstring" value="[^"]*"\s*/>',
                    f'<entry key="dbPath" type="xstring" value="{_valor(banco)}" />', settings)
    settings.write_text(texto, encoding="utf-8")
    print(f"  {no:<22} -> {banco}")


def empacotar() -> Path:
    """Gera o .knwf (um zip da pasta do workflow, sem estado de execução)."""
    destino = KNIME / "fenty_consolidacao.knwf"
    ignorar = ("internal", ".savedWithData", ".knimeLock", "data")
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as zipado:
        for arquivo in sorted(WORKFLOW.rglob("*")):
            partes = arquivo.relative_to(WORKFLOW).parts
            if arquivo.is_file() and not any(
                    p in ignorar or p.startswith(("port_", ".artifacts")) or p.endswith(".lock")
                    for p in partes):
                zipado.write(arquivo, arquivo.relative_to(KNIME).as_posix())
    return destino


if __name__ == "__main__":
    pastas = [Path(p) for p in sys.argv[1:]] or [WORKFLOW]
    if WORKFLOW not in pastas:
        pastas.insert(0, WORKFLOW)
    for pasta in pastas:
        print(f"Workflow em {pasta}:")
        configurar(pasta)
    print(f"Pacote gerado: {empacotar()}")
