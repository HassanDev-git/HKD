# HKD 1.0 Language Reference Manual

## 1. Syntax Overview
HKD programs are structured as a series of declarations and statements.

```hkd
import math
import http

const MAX_RETRIES = 5

fn compute_metric(x: int, y: int) -> int {
    let result = (x * x) + (y * y)
    return math.sqrt(result)
}

fn main() {
    println("Metric: " + compute_metric(3, 4))
}

main()
```

---

## 2. Operators & Precedence
Listed in order from highest to lowest precedence:

| Precedence | Operator | Description | Associativity |
| :---: | :--- | :--- | :---: |
| 1 | `()`, `[]`, `.` | Call, Index, Member Access | Left |
| 2 | `-` (unary), `!`, `~` | Negation, Logical NOT, Bitwise NOT | Right |
| 3 | `**` | Exponentiation | Right |
| 4 | `*`, `/`, `%` | Multiplication, Division, Modulo | Left |
| 5 | `+`, `-` | Addition, Subtraction, String Concatenation | Left |
| 6 | `<<`, `>>` | Bitwise Shifts | Left |
| 7 | `<`, `<=`, `>`, `>=` | Relational Comparisons | Left |
| 8 | `==`, `!=` | Equality / Inequality | Left |
| 9 | `&` | Bitwise AND | Left |
| 10 | `^` | Bitwise XOR | Left |
| 11 | `\|` | Bitwise OR | Left |
| 12 | `&&` | Logical AND (Short-circuiting) | Left |
| 13 | `\|\|` | Logical OR (Short-circuiting) | Left |
| 14 | `=`, `+=`, `-=`, `*=`, `/=` | Assignment & Compound Assignment | Right |

---

## 3. Control Structures

### 3.1 Conditionals
```hkd
if score >= 90 {
    println("Grade: A")
} else if score >= 80 {
    println("Grade: B")
} else {
    println("Grade: C")
}
```

### 3.2 Loops
```hkd
// While loop
let mut i = 0
while i < 10 {
    i += 1
}

// For-in loop over array
let fruits = ["apple", "banana", "cherry"]
for item in fruits {
    println(item)
}

// For-in loop over numeric range
for n in 1..5 {
    println(n)
}
```

---

## 4. Structs & Types
```hkd
struct ServerConfig {
    host: str,
    port: int,
    workers: int
}

let cfg = ServerConfig {
    host: "127.0.0.1",
    port: 8080,
    workers: 4
}

println("Starting on port: " + cfg.port)
```

---

## 5. Testing Primitives
Unit tests are declared natively within any module using `test`:

```hkd
test "basic arithmetic" {
    assert(2 + 2 == 4)
    assert(10 - 3 == 7, "Subtraction invariant failed")
}
```
Running `hkd test` automatically discovers and executes all test blocks across the project.
