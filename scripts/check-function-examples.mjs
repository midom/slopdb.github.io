import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'slopdb'));
const temp = await mkdtemp(path.join(os.tmpdir(), 'slopdb-function-examples-'));
const inspector = `package db
import("testing";"encoding/json";"os";"strings";"context";"time")
func TestWebsiteFunctionExamples(t *testing.T) {
 var entries []struct { Family,Name,Example string; Connection bool }
 data,err:=os.ReadFile(os.Getenv("SLOPDB_FUNCTION_EXAMPLES"));if err!=nil {t.Fatal(err)}
 if err=json.Unmarshal(data,&entries);err!=nil {t.Fatal(err)}
 database,err:=Open(t.TempDir(),nil);if err!=nil {t.Fatal(err)}
 t.Cleanup(func(){if err:=database.Close();err!=nil {t.Error(err)}})
 sessions:=map[string]*Session{}
 for _,family:=range []string{"native","mysql","postgres"} {
  s,err:=database.NewSession();if err!=nil {t.Fatal(err)}
  if family=="mysql" {err=s.SetMySQLMode(true)};if family=="postgres" {err=s.SetPostgresMode(true)};if err!=nil {t.Fatal(err)}
  sessions[family]=s
 }
 for _,entry:=range entries {t.Run(entry.Family+"/"+entry.Name,func(t *testing.T){
  if entry.Connection {t.Skip("requires protocol or schema setup")}
  family:=entry.Family;if family!="mysql" && family!="postgres" {family="native"}
  query:=entry.Example;if !strings.HasPrefix(strings.ToUpper(strings.TrimSpace(query)),"SELECT ") {query="SELECT "+query+";"}
  ctx,cancel:=context.WithTimeout(context.Background(),3*time.Second);defer cancel()
  if _,err:=sessions[family].ExecContext(ctx,query);err!=nil {t.Fatalf("%s: %v",query,err)}
 })}
}
`;
try {
  await writeFile(path.join(temp, 'examples_test.go'), inspector);
  await writeFile(path.join(temp, 'overlay.json'), JSON.stringify({ Replace: { [path.join(source, 'db/zz_website_examples_test.go')]: path.join(temp, 'examples_test.go') } }));
  execFileSync('go', ['test', '-vet=off', '-overlay', path.join(temp, 'overlay.json'), './db', '-run', '^TestWebsiteFunctionExamples$', '-count=1', '-timeout', '2m'], { cwd: source, env: { ...process.env, SLOPDB_FUNCTION_EXAMPLES: path.join(root, 'content/functions.json') }, stdio: 'inherit' });
} finally {
  await rm(temp, { recursive: true, force: true });
}
