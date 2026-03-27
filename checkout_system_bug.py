def calculate_discount(price, discount_percent):
    """Calculates final price after discount."""
    if discount_percent >= 100 or discount_percent <= 0:
        return price
    
    # Bug 1: Math error. 10% discount written as 10 will multiply price by 10!
    discount_amount = price * discount_percent
    return price - discount_amount

def process_order(items):
    total = 0
    for item in items:
        # Bug 2: Will crash with KeyError if an item doesn't have a 'discount' field
        price_after_discount = calculate_discount(item['price'], item['discount'])
        total += price_after_discount
        
    return total

# Example Shopping Cart
cart = [
    {'name': 'Laptop', 'price': 1000.0, 'discount': 20}, # 20% off
    {'name': 'Mouse', 'price': 50.0}                     # No discount field
]

if __name__ == "__main__":
    final_amount = process_order(cart)
    print("Total checkout amount:", final_amount)
