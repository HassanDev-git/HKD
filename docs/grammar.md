# HKD 1.0.0 Formal Grammar Specification (EBNF)

## 1. Notational Conventions
- `[ ... ]` denotes optional elements (0 or 1).
- `{ ... }` denotes repetition (0 or more).
- `|` denotes alternatives.
- Literal terminal strings are enclosed in double quotes `"..."`.

---

## 2. Grammar Rules

```ebnf
Program ::= { Statement } EOF ;

Statement ::= VarDeclStmt
            | ConstDeclStmt
            | FunctionDeclStmt
            | StructDeclStmt
            | TypeAliasStmt
            | ReturnStmt
            | BreakStmt
            | ContinueStmt
            | IfStmt
            | WhileStmt
            | ForStmt
            | BlockStmt
            | ExprStmt
            | ImportStmt
            | ExportStmt
            | TestStmt
            | AssertStmt ;

VarDeclStmt ::= "let" Ident [ ":" Type ] [ "=" Expr ] ;
ConstDeclStmt ::= "const" Ident [ ":" Type ] "=" Expr ;

FunctionDeclStmt ::= "fn" Ident "(" [ ParameterList ] ")" [ "->" Type ] BlockStmt ;
ParameterList ::= Parameter { "," Parameter } ;
Parameter ::= Ident [ ":" Type ] ;

StructDeclStmt ::= "struct" Ident "{" { StructField } "}" ;
StructField ::= Ident ":" Type [ "," ] ;

TypeAliasStmt ::= "type" Ident "=" Type ;

ReturnStmt ::= "return" [ Expr ] ;
BreakStmt ::= "break" ;
ContinueStmt ::= "continue" ;

IfStmt ::= "if" Expr BlockStmt [ "else" ( IfStmt | BlockStmt ) ] ;
WhileStmt ::= "while" Expr BlockStmt ;
ForStmt ::= "for" Ident "in" Expr BlockStmt ;
BlockStmt ::= "{" { Statement } "}" ;

ImportStmt ::= "import" ( Ident [ "from" String ] | "{" ImportSpecifiers "}" "from" String ) ;
ImportSpecifiers ::= Ident { "," Ident } ;

ExportStmt ::= "export" ( FunctionDeclStmt | VarDeclStmt | ConstDeclStmt | StructDeclStmt | TypeAliasStmt ) ;

TestStmt ::= "test" String BlockStmt ;
AssertStmt ::= "assert" "(" Expr [ "," Expr ] ")" ;

ExprStmt ::= Expr ;

Expr ::= AssignExpr ;

AssignExpr ::= LogicalOrExpr [ ( "=" | "+=" | "-=" | "*=" | "/=" ) AssignExpr ] ;

LogicalOrExpr ::= LogicalAndExpr { "||" LogicalAndExpr } ;
LogicalAndExpr ::= BitwiseOrExpr { "&&" BitwiseOrExpr } ;
BitwiseOrExpr ::= BitwiseXorExpr { "|" BitwiseXorExpr } ;
BitwiseXorExpr ::= BitwiseAndExpr { "^" BitwiseAndExpr } ;
BitwiseAndExpr ::= EqualityExpr { "&" EqualityExpr } ;

EqualityExpr ::= RelationalExpr { ( "==" | "!=" ) RelationalExpr } ;
RelationalExpr ::= ShiftExpr { ( "<" | "<=" | ">" | ">=" ) ShiftExpr } ;
ShiftExpr ::= AdditiveExpr { ( "<<" | ">>" ) AdditiveExpr } ;
AdditiveExpr ::= MultiplicativeExpr { ( "+" | "-" ) MultiplicativeExpr } ;
MultiplicativeExpr ::= ExponentExpr { ( "*" | "/" | "%" ) ExponentExpr } ;
ExponentExpr ::= UnaryExpr [ "**" ExponentExpr ] ;

UnaryExpr ::= ( "-" | "!" | "~" ) UnaryExpr
            | PrimaryExpr ;

PrimaryExpr ::= Literal
              | Ident
              | "(" Expr ")"
              | ArrayLiteral
              | ObjectLiteral
              | RangeExpr
              | CallExpr
              | MemberExpr
              | IndexExpr ;

ArrayLiteral ::= "[" [ Expr { "," Expr } ] "]" ;
ObjectLiteral ::= "{" [ ObjectField { "," ObjectField } ] "}" ;
ObjectField ::= ( Ident | String ) ":" Expr ;

RangeExpr ::= Expr ( ".." | "..=" ) Expr ;

CallExpr ::= PrimaryExpr "(" [ ArgumentList ] ")" ;
ArgumentList ::= Expr { "," Expr } ;

MemberExpr ::= PrimaryExpr "." Ident ;
IndexExpr ::= PrimaryExpr "[" Expr "]" ;

Type ::= "int" | "float" | "bool" | "str" | "null"
       | "[" Type "]"
       | "fn" "(" [ TypeList ] ")" "->" Type
       | Ident ;

TypeList ::= Type { "," Type } ;
```
