import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CONFIG_PREFIX } from '../constants';
import { CommonUtils } from '../utils/commonUtils';

export class ConfigManager implements vscode.Disposable{
  private watcher: vscode.Disposable | undefined;
  private home:string;
  private port:number;
  private debugPort:number;
  private contextPath:string;
  private vmOptions:string;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    const cfg = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    this.home = cfg.get<string>('home') || this.bundledTomcatHome();
    this.port = cfg.get("port")!;
    this.debugPort = cfg.get("debugPort")!;
    this.contextPath = cfg.get("contextPath")!;
    this.vmOptions = cfg.get("vmOptions")!;
  }

  dispose() {
    if(this.watcher){
      this.watcher.dispose();
    }
  }

  registerConfigWatcher() {
    this.watcher = vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(CONFIG_PREFIX)) {
        const cfg = vscode.workspace.getConfiguration(CONFIG_PREFIX);
        this.home = cfg.get<string>('home') || this.bundledTomcatHome();
        this.port = cfg.get("port")!;
        this.debugPort = cfg.get("debugPort")!;
        this.contextPath = cfg.get("contextPath")!;
        this.vmOptions = cfg.get("vmOptions")!;
      }
    });
  }

  setupCatalinaBase(){
    const storagePath = this.context.storageUri!.fsPath;
    fs.mkdirSync(storagePath, { recursive: true });

    const catalinaBase = path.join(storagePath, 'tomcat');
    fs.rmSync(catalinaBase, { recursive: true, force: true });
    for (const d of ['conf', 'logs', 'temp', 'work']) {
      const dp = path.join(catalinaBase, d);
      if (!fs.existsSync(dp)) {
        fs.mkdirSync(dp, { recursive: true });
      }
    }

    const localhostDir = path.join(catalinaBase, 'conf', 'Catalina', 'localhost');
    if (!fs.existsSync(localhostDir)) {
      fs.mkdirSync(localhostDir, { recursive: true });
    }

    const srcConf = path.join(this.home, 'conf');
    const tgtConf = path.join(catalinaBase, 'conf');
    if (fs.existsSync(srcConf)) {
      for (const e of fs.readdirSync(srcConf, { withFileTypes: true })) {
        if (e.isFile()) {
          const s = path.join(srcConf, e.name), d = path.join(tgtConf, e.name);
          fs.copyFileSync(s, d);
        }
      }
    }

    // 修改server.xml端口
    this.modifyServerXml();
    // 修改logging.properties：让localhost日志同时输出到控制台
    this.modifyLoggingProperties();
    /** 写入conf/Catalina/localhost/{contextPath}.xml → docBase指向目标地址 */
    this.writeContextXml();
  }

  /** 修改server.xml：替换HTTP端口和shutdown端口 */
  private modifyServerXml(){
    const fp = path.join(this.context.storageUri!.fsPath,'tomcat','conf', 'server.xml');
    if (!fs.existsSync(fp)){
      return;
    }
    let c = fs.readFileSync(fp, 'utf-8');
    // HTTP Connector，匹配任意当前端口值
    c = c.replace(/(<Connector\s[^>]*?)(port="\d+")/, `$1port="${this.port}"`);
    // Shutdown端口
    c = c.replace(/(<Server\s[^>]*?)(port="\d+")/, '$1port="-1"');
    fs.writeFileSync(fp, c, 'utf-8');
  }

  /** 修改logging.properties：让localhost日志同时输出到控制台（stdout） */
  private modifyLoggingProperties(){
    const fp = path.join(this.context.storageUri!.fsPath,'tomcat','conf', 'logging.properties');
    if (!fs.existsSync(fp)){
      return;
    }
    let c = fs.readFileSync(fp, 'utf-8');
    // 将localhost的handler从纯文件输出改为同时输出到控制台
    c = c.replace(
      /org\.apache\.catalina\.core\.ContainerBase\.\[Catalina\]\.\[localhost\]\.handlers\s*=\s*.+/,
      'org.apache.catalina.core.ContainerBase.[Catalina].[localhost].handlers = 2localhost.org.apache.juli.AsyncFileHandler, java.util.logging.ConsoleHandler'
    );
    fs.writeFileSync(fp, c, 'utf-8');
  }

  /** 写入conf/Catalina/localhost/{contextPath}.xml → docBase指向目标 */
  private async writeContextXml() {
    const dir = path.join(this.context.storageUri!.fsPath,'tomcat', 'conf', 'Catalina', 'localhost');
    const finalName = await CommonUtils.getMavenFinalName();
    const docBase = path.join(CommonUtils.getWorkSpace(),'target', finalName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); 
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Context docBase="${docBase}" reloadable="false" crossContext="true"/>`;
    fs.writeFileSync(path.join(dir, `${this.contextPath}.xml`), xml, 'utf-8');
  }

  getHome():string{
    return this.home;
  }

  /** 内置 Tomcat 路径：扩展安装目录下的 resources/tomcat9 */
  private bundledTomcatHome(): string {
    return path.join(this.context.extensionPath, 'resources', 'tomcat9');
  }

  getPort():number{
    return this.port;
  }
  getDebugPort():number{
    return this.debugPort;
  }
  getContextPath():string{
    return this.contextPath;
  }
  getVmOptions():string{
    return this.vmOptions;
  }

}