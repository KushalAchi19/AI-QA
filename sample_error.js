// sample_error.js
// This program has a logic bug and a reference error.
function calculateInvoiceTotal(items, taxRate) {
    let rawTotal = 0;
    
    // Logic error: missing .price or item calculation
    for (let i = 0; i < items.length; i++) {
        rawTotal += items[i]; 
    }
    
    // Reference Error: subttl is not defined
    let grandTotal = subttl + (subttl * taxRate);
    
    return grandTotal;
}

const cart = [{name: 'Laptop', price: 1000}, {name: 'Mouse', price: 50}];
console.log(calculateInvoiceTotal(cart, 0.05));
