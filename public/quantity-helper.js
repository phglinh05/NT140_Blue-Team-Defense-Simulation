// quantity-helper.js - Helper functions cho quantity modal
function incrementQty() {
    const input = document.getElementById('modalQuantityInput');
    if (input) {
        const val = parseInt(input.value) || 1;
        if (val < 999) input.value = val + 1;
    }
}

function decrementQty() {
    const input = document.getElementById('modalQuantityInput');
    if (input) {
        const val = parseInt(input.value) || 1;
        if (val > 1) input.value = val - 1;
    }
}
