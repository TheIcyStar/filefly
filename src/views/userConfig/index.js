const vscode = acquireVsCodeApi()

const PRESET_COLORS = [
    '#f44747', // red
    '#ff8c00', // orange
    '#ffd700', // yellow
    '#4ec9b0', // teal
    '#4fc3f7', // light blue
    '#569cd6', // blue
    '#9cdcfe', // pale blue
    '#c586c0', // purple
    '#ce9178', // peach
    '#6a9955', // green
]

const swatchContainer = document.getElementById('colorSwatches')
const selectedColorInput = document.getElementById('selectedColor')
const customColorInput = document.getElementById('customColor')

function setSelectedColor(color) {
    selectedColorInput.value = color
    customColorInput.value = color
    document.querySelectorAll('.swatch').forEach(function(s) {
        s.classList.toggle('selected', s.dataset.color === color)
    })
}

PRESET_COLORS.forEach(function(color) {
    const swatch = document.createElement('div')
    swatch.className = 'swatch'
    swatch.dataset.color = color
    swatch.style.backgroundColor = color
    swatch.title = color
    swatch.addEventListener('click', function() { setSelectedColor(color) })
    swatchContainer.appendChild(swatch)
})

customColorInput.addEventListener('input', function() {
    selectedColorInput.value = this.value
    document.querySelectorAll('.swatch').forEach(function(s) {
        s.classList.remove('selected')
    })
})

setSelectedColor(selectedColorInput.value)

function showError(id, visible) {
    document.getElementById(id).classList.toggle('visible', visible)
}

function validateAll() {
    let valid = true

    const displayName = document.getElementById('displayName').value.trim()
    if (!displayName) {
        document.getElementById('displayName').classList.add('error')
        showError('err-displayName', true)
        document.getElementById('validationSummary').classList.add('visible')
        document.getElementById('validationList').innerHTML = '<li>Display name is required.</li>'
        valid = false
    } else {
        document.getElementById('displayName').classList.remove('error')
        showError('err-displayName', false)
        document.getElementById('validationSummary').classList.remove('visible')
    }

    return valid
}

function collectPayload() {
    return {
        displayName: document.getElementById('displayName').value.trim(),
        bio: document.getElementById('bio').value.trim(),
        color: document.getElementById('selectedColor').value,
    }
}

document.getElementById('btnNext').addEventListener('click', function() {
    if (!validateAll()) return
    vscode.postMessage({ command: 'submit', payload: collectPayload() })
})

document.getElementById('btnCancel').addEventListener('click', function() {
    vscode.postMessage({ command: 'cancel' })
})

function populateConfig(cfg) {
    document.getElementById('displayName').value = cfg.displayName || ''
    document.getElementById('bio').value = cfg.bio || ''
    if (cfg.color) { setSelectedColor(cfg.color) }
}
