def binary_search(arr, target):
    low = 0
    high = len(arr)
    
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
            
    return -1

# Edge test case
result = binary_search([1, 3, 5, 7, 9], 10)
print("Found target at index:", result)
