import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// Inspect the actual initialized registries without changing the database checkout.
// Go's overlay adds an inspection file only to this invocation's virtual filesystem.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'slopdb'));
const temp = await mkdtemp(path.join(os.tmpdir(), 'slopdb-function-inventory-'));
const output = path.join(temp, 'inventory.json');
const inspector = `package sql
import("testing";"encoding/json";"os";"runtime";"reflect";"strings")
func TestWebsiteFunctionInventory(t *testing.T) {
 type Entry struct { Name, Family string; Min, Max int; Result string; Volatile, MySQLOnly bool; Source string; Line int }
 out:=[]Entry{}
 for family,registry:=range map[string]map[string]mysqlFunctionSpec{"mysql":mysqlFunctionRegistry,"postgres":postgresFunctionRegistry} {
  for name,spec:=range registry {
   if strings.HasPrefix(name,"__") { continue }
   file,line:="",0
   if spec.Eval!=nil { pc:=reflect.ValueOf(spec.Eval).Pointer();if f:=runtime.FuncForPC(pc);f!=nil {file,line=f.FileLine(pc)} }
   if n:=strings.LastIndex(file,"/sql/");n>=0 { file=file[n+1:] }
   result:=spec.Return.String();if spec.Metadata!=nil { result="argument-dependent" }
   out=append(out,Entry{name,family,spec.Min,spec.Max,result,spec.Volatile,spec.MySQLOnly,file,line})
  }
 }
 for name,limits:=range jsonFunctionArity { if !strings.HasPrefix(name,"__") {out=append(out,Entry{Name:name,Family:"json",Min:limits[0],Max:limits[1],Source:"sql/json_functions.go"})} }
 for name,n:=range scalarExactArguments { out=append(out,Entry{Name:name,Family:"core",Min:n,Max:n,Source:"sql/executor.go"}) }
 for _,name:=range strings.Fields("COALESCE MIN MAX ROUND TRIM LTRIM RTRIM SUBSTR DATETIME DATE TIME JULIANDAY STRFTIME") {
  min,max:=-1,-1;for n:=0;n<=12;n++ {if validateScalarFunctionDialect(&FuncCallExpr{Name:name,Args:make([]Expression,n)},false)==nil {if min<0 {min=n};max=n}}
  if min<0 {t.Fatalf("native function %s is no longer recognized",name)};if max==12 {max=-1};out=append(out,Entry{Name:name,Family:"core",Min:min,Max:max,Source:"sql/executor.go"})
 }
 for _,name:=range strings.Fields("IF GREATEST LEAST CONCAT SUBSTRING SYSDATE NOW CURRENT_TIMESTAMP UNIX_TIMESTAMP GET_LOCK RELEASE_LOCK IS_FREE_LOCK CURRENT_USER DATABASE VERSION CONNECTION_ID") {
  min,max:=-1,-1;for n:=0;n<=12;n++ {valid,_:=validMySQLFunction(name,n);if valid {if min<0 {min=n};max=n}}
  if min<0 {t.Fatalf("MySQL function %s is no longer recognized",name)};if max==12 {max=-1};out=append(out,Entry{Name:name,Family:"mysql",Min:min,Max:max,Source:"sql/mysql_functions.go"})
 }
 out=append(out,Entry{Name:"CONVERT",Family:"mysql",Min:2,Max:2,Source:"sql/mysql_functions.go"})
 out=append(out,Entry{Name:"MATCH",Family:"mysql",Min:1,Max:-1,Source:"sql/mysql_fulltext.go"})
 for _,name:=range strings.Fields("COUNT SUM AVG MIN MAX TOTAL GROUP_CONCAT") {max:=1;if name=="GROUP_CONCAT" {max=2};out=append(out,Entry{Name:name,Family:"aggregate",Min:1,Max:max,Source:"sql/aggregate_execution.go"})}
 for _,name:=range strings.Fields("ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE") {min,max:=0,0;switch name {case "LAG","LEAD":min,max=1,3;case "FIRST_VALUE","LAST_VALUE":min,max=1,1;case "NTH_VALUE":min,max=2,2};out=append(out,Entry{Name:name,Family:"window",Min:min,Max:max,Source:"sql/window_execution.go"})}
 data,err:=json.Marshal(out);if err!=nil {t.Fatal(err)};if err=os.WriteFile(os.Getenv("SLOPDB_FUNCTION_INVENTORY_OUTPUT"),data,0600);err!=nil {t.Fatal(err)}
}
`;
try {
  await writeFile(path.join(temp, 'inventory_test.go'), inspector);
  await writeFile(path.join(temp, 'overlay.json'), JSON.stringify({ Replace: { [path.join(source, 'sql/zz_website_inventory_test.go')]: path.join(temp, 'inventory_test.go') } }));
  execFileSync('go', ['test', '-vet=off', '-overlay', path.join(temp, 'overlay.json'), './sql', '-run', '^TestWebsiteFunctionInventory$', '-count=1', '-timeout', '2m'], { cwd: source, env: { ...process.env, SLOPDB_FUNCTION_INVENTORY_OUTPUT: output }, stdio: ['ignore', 'inherit', 'inherit'] });
  const entries = JSON.parse(await readFile(output, 'utf8')).sort((a, b) => a.Family.localeCompare(b.Family) || a.Name.localeCompare(b.Name));
  const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const inventory = { revision, functions: entries.map(entry => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key[0].toLowerCase() + key.slice(1), value]))) };
  await writeFile(path.join(root, 'content/function-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  console.log(`Inspected ${entries.length} function variants at ${revision.slice(0, 7)}.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
