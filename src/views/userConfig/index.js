(function () {


    const vscode = acquireVsCodeApi();

    const displayNameInput = document.getElementById('displayName');
    const customColorInput = document.getElementById('customColor');
    const selectedColorInput = document.getElementById('selectedColor');
    const btnNext = document.getElementById('btnNext');
    const btnCancel = document.getElementById('btnCancel');
    const validationSummary = document.getElementById('validationSummary');
    const validationList = document.getElementById('validationList');
    const colorSwatches = document.getElementById('colorSwatches');

    const presetColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

    // Initialize color swatches
    presetColors.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.backgroundColor = color;
        swatch.addEventListener('click', () => {
            selectedColorInput.value = color;
            customColorInput.value = color;
            updateSwatchSelection();
        });
        colorSwatches.appendChild(swatch);
    });

    function updateSwatchSelection() {
        const selected = selectedColorInput.value;
        document.querySelectorAll('.swatch').forEach(swatch => {
            if (swatch.style.backgroundColor === rgbToHex(selected)) {
                swatch.classList.add('selected');
            } else {
                swatch.classList.remove('selected');
            }
        });
    }

    function rgbToHex(rgb) {
        if (rgb.startsWith('#')) {
            return rgb.toUpperCase();
        }
        const result = rgb.match(/\d+/g);
        if (!result || result.length < 3) return rgb;
        const r = parseInt(result[0]).toString(16).padStart(2, '0');
        const g = parseInt(result[1]).toString(16).padStart(2, '0');
        const b = parseInt(result[2]).toString(16).padStart(2, '0');
        return '#' + (r + g + b + '4C').toUpperCase();
    }

    customColorInput.addEventListener('change', () => {
        selectedColorInput.value = customColorInput.value;
        updateSwatchSelection();
    });

    function validateForm() {
        const errors = [];
        if (!displayNameInput.value.trim()) {
            errors.push('Display name is required.');
        }
        return errors;
    }

    function showValidationErrors(errors) {
        if (errors.length > 0) {
            validationSummary.style.display = 'block';
            validationList.innerHTML = '';
            errors.forEach(error => {
                const li = document.createElement('li');
                li.textContent = error;
                validationList.appendChild(li);
            });
        } else {
            validationSummary.style.display = 'none';
        }
    }

    window.populateConfig = function populateConfig(config) {
        if (!config) {
            return;
        }

        displayNameInput.value = typeof config.displayName === 'string' ? config.displayName : '';

        const color = typeof config.color === 'string' ? config.color : selectedColorInput.value;
        selectedColorInput.value = color;
        customColorInput.value = color;
        updateSwatchSelection();
        showValidationErrors([]);
    };

    btnNext.addEventListener('click', () => {
        const errors = validateForm();
        showValidationErrors(errors);

        if (errors.length === 0) {
            const userData = {
                displayName: displayNameInput.value.trim(),
                color: selectedColorInput.value
            };
            vscode.postMessage({
                command: 'submit',
                payload: userData
            });
        }
    });

    btnCancel.addEventListener('click', () => {
        vscode.postMessage({ command: 'cancel' });
    });

    // Initialize with any passed data
    updateSwatchSelection();
    validationSummary.style.display = 'none';
})();
