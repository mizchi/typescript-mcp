// For more information see https://aka.ms/fsharp-console-apps

let add x y = x + y

let main() =
    let result = add 5 3
    printfn "Hello from F#"
    printfn "5 + 3 = %d" result
    0

main()
