<?php
// An in-memory registration fixture, never an installed or packaged 1.3 library.
// Validation and dependency traversal execute the installed H5P implementation.
error_reporting(E_ALL & ~E_DEPRECATED);
set_error_handler(function ($severity, $message, $file, $line) {
    if (error_reporting() & $severity) {
        throw new ErrorException($message, 0, $severity, $file, $line);
    }
});
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
require_once $input['corePath'];

final class ColumnFixtureStorage {
    public $errors = [];
    public $libraries;
    public $semantics;
    public $libraryRoots;

    public function t($message, $arguments = []) {
        return strtr($message, $arguments);
    }

    public function setErrorMessage($message, $code = null) {
        $this->errors[] = ['message' => $message, 'code' => $code];
    }

    public function loadLibrary($name, $major, $minor) {
        $key = "$name $major.$minor";
        if (isset($this->libraries[$key])) {
            return $this->libraries[$key];
        }
        foreach ($this->libraryRoots as $root) {
            $file = "$root/$name-$major.$minor/library.json";
            if (is_file($file)) {
                return json_decode(file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            }
        }
        return null;
    }

    public function loadLibrarySemantics($name, $major, $minor) {
        return $this->semantics["$name $major.$minor"] ?? null;
    }

    public function alterLibrarySemantics(&$semantics, $name, $major, $minor) {
        // Storage adapter only: leave the actual child and Column semantics unchanged.
    }
}

function validateFixture($input, $columnSemantics) {
    $storage = new ColumnFixtureStorage();
    $column = $input['columnLibrary'];
    $child = $input['childLibrary'];
    if ([$child['majorVersion'], $child['minorVersion'], $child['patchVersion']] !== [1, 2, 6]) {
        throw new RuntimeException('The prospective fixture requires unchanged AdvancedTextPapiJo 1.2.6 sources.');
    }
    // Only the registration identity changes; semantics and content remain 1.2.6.
    $child['minorVersion'] = 3;
    $child['patchVersion'] = 0;
    $columnKey = $column['machineName'] . ' ' . $column['majorVersion'] . '.' . $column['minorVersion'];
    $storage->libraries = [$columnKey => $column, 'H5P.AdvancedTextPapiJo 1.3' => $child];
    $storage->semantics = [
        $columnKey => json_encode($columnSemantics, JSON_THROW_ON_ERROR),
        'H5P.AdvancedTextPapiJo 1.3' => json_encode($input['childSemantics'], JSON_THROW_ON_ERROR)
    ];
    $storage->libraryRoots = $input['libraryRoots'];
    // Avoid host filesystem initialization. All H5PCore methods remain original,
    // including loadLibrary, loadLibrarySemantics and findLibraryDependencies.
    $core = (new ReflectionClass(H5PCore::class))->newInstanceWithoutConstructor();
    (new ReflectionProperty(H5PCore::class, 'h5pF'))->setValue($core, $storage);
    $validator = new H5PContentValidator($storage, $core);
    $content = json_decode(json_encode($input['content'], JSON_THROW_ON_ERROR));
    $validator->validateLibrary($content, (object) ['options' => [$columnKey]]);

    $dependencies = [];
    foreach ($validator->getDependencies() as $dependency) {
        $library = $dependency['library'];
        $dependencies[] = [
            'machineName' => $library['machineName'],
            'majorVersion' => $library['majorVersion'],
            'minorVersion' => $library['minorVersion'],
            'type' => $dependency['type']
        ];
    }
    // Also check the old field directly: validateGroup removes a null child key.
    $directChild = json_decode(json_encode($input['content']['params']['content'][0]['content'], JSON_THROW_ON_ERROR));
    $validator->validateLibrary($directChild, (object) $columnSemantics[0]['field']['fields'][0]);
    return [
        'content' => $content,
        'directChild' => $directChild,
        'dependencies' => $dependencies,
        'errors' => $storage->errors
    ];
}

echo json_encode([
    'updated' => validateFixture($input, $input['columnSemantics']),
    'old' => validateFixture($input, $input['oldColumnSemantics']),
    'validatorPath' => (new ReflectionClass(H5PContentValidator::class))->getFileName(),
    'dependencyTraversalPath' => (new ReflectionMethod(H5PCore::class, 'findLibraryDependencies'))->getFileName(),
    'sourceChildVersion' => '1.2.6',
    'registrationOnlyVersion' => '1.3.0'
], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT);
