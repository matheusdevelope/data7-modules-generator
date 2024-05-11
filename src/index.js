const fs = require("fs");
const chokidar = require("chokidar");
const { program } = require("commander");
const { join, extname } = require("path");

class Modulo {
  constructor(nome, conteudo, module, notModule) {
    this.nome = nome;
    this.conteudo = conteudo;
    this.module = module;
    this.notModule = notModule;
  }
}

class Options {
  constructor(path, output, watch, checkmodule, cleanNotModule) {
    this.path = path;
    this.output = output;
    this.watch = watch;
    this.checkmodule = checkmodule;
    this.cleanNotModule = cleanNotModule;
  }
}

let options = null;

function main() {
  program
    .description("Converte arquivos .7proj em módulos .bas.\nCada namespace/module é salvo em um arquivo .bas separado.")
    .requiredOption("-p, --path <path>", "Caminho do arquivo ou pasta.")
    .requiredOption("-o, --output <output>", "Pasta de destino.")
    .option("-w, --watch", "Monitorar a pasta continuamente.")
    .option(
      "-cm, --checkmodule",
      "Os modulos devem ser marcados com  um comentário @Module para serem exportados."
    )
    .option(
      "-cnm, --cleannotmodule",
      "Remover modulos marcados com @NotModule da pasta de destino."
    )
    
    .parse(process.argv);
  const opts = program.opts();

  options = new Options(opts.path, opts.output, opts.watch, opts.checkmodule);

  if (options.watch) {
    monitorChanges(options);
  } else {
    processPath(options);
  }
}

function monitorChanges(options) {
  const path = options.path;
  //   if (fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
  if (fs.existsSync(path)) {
    console.log(`Monitorando alterações em ${path}...`);

    const watcher = chokidar.watch(path, {
      ignored: /[\/\\]\./, // Ignora arquivos ocultos
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    watcher.on("change", (filePath) => {
      console.log(`Arquivo alterado: ${filePath}`);
      if (extname(filePath).toLowerCase() === ".7proj") {
        processFile(filePath, options.output);
      }
    });

    console.log("Pressione 'q' e depois Enter para sair.");
    process.stdin.on("data", (data) => {
      console.log("data", data.toString().trim());
      if (data.toString().trim() === "q") {
        watcher.close();
      }
    });
  } else if (fs.existsSync(path) && fs.lstatSync(path).isFile()) {
    processFile(path, options.output);
  } else {
    console.log(`O caminho '${path}' não é válido.`);
  }
}

function processPath(options) {
  const path = options.path;
  if (fs.existsSync(path) && fs.lstatSync(path).isDirectory()) {
    processFolder(path, options.output);
  } else if (fs.existsSync(path) && fs.lstatSync(path).isFile()) {
    processFile(path, options.output);
  } else {
    console.log(`O caminho '${path}' não é válido.`);
  }
}

function processFolder(folderPath, outputFolder) {
  console.log(`Processando pasta ${folderPath}...`);
  fs.readdir(folderPath, (err, files) => {
    if (err) throw err;
    files.forEach((file) => {
      if (file.endsWith(".7Proj")) {
        processFile(join(folderPath, file), outputFolder);
      }
    });
  });
}

function processFile(filePath, outputFolder) {
  console.log(`Processando arquivo ${filePath}...`);
  try {
    const modulos = processarArquivo7proj(filePath);
    modulos.forEach((modulo) => {
      const nomeModulo = join(outputFolder, `${modulo.nome}.bas`);
      if (modulo.notModule || (options.checkmodule && !modulo.module)) {
        if (options.cleanNotModule && modulo.notModule) {
          fs.unlinkSync(filePath);
        }
        return;
      }
      fs.writeFileSync(nomeModulo, modulo.conteudo);
      console.log(`Módulo ${modulo.nome} salvo como ${nomeModulo}`);
    });
  } catch (error) {
    console.error(`Erro ao processar o arquivo: ${error.message}`);
  }
}

function processarArquivo7proj(caminhoArquivo) {
  try {
    const conteudo = fs.readFileSync(caminhoArquivo, "utf8");

    const regex_modulos_content = /<Modulos>([\s\S]*?)<\/Modulos>/;
    const regex_modulos = /<([^>]+)>([\s\S]*?)<\/\1>/g;
    const modulos = conteudo
      .match(regex_modulos_content)[1]
      .match(regex_modulos);

    const modulesList = [];
    for (let i = 0; i < modulos.length; i++) {
      const moduleContent = modulos[i].trim() || "";
      const namespaces = moduleContent.match(/^[ \t]*(Namespace|Module)\s+(\w+)/igm)
      if (namespaces === null) {
        continue;
      }
      const namespace = namespaces[0].replace(/Namespace |Module /gi, "").trim();
      let content = moduleContent.match(/<Codigo>(.*?)<\/Codigo>/s)[1];
      content = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ");
      const module = moduleContent.toUpperCase().includes("'@MODULE");
      const notModule = moduleContent.toUpperCase().includes("'@NOTMODULE");
      modulesList.push(new Modulo(namespace, content, module, notModule));
    }

    return modulesList;
  } catch (error) {
    console.error("Erro ao processar o arquivo:", error);
    return [];
  }
}
main();
