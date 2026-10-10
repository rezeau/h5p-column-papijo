<?php
// Read-only installed H5P probe: no WordPress bootstrap, DB, AJAX or file writes.
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
    public $libraries = [];
    public $semantics = [];
    public $libraryRoots = [];
    public function t($message, $arguments = []) { return strtr($message, $arguments); }
    public function setErrorMessage($message, $code = null) {
        $this->errors[] = ['message' => $message, 'code' => $code];
    }
    private function readLibraryFile($name, $major, $minor, $file) {
        foreach ($this->libraryRoots as $root) {
            $path = "$root/$name-$major.$minor/$file";
            if (is_file($path)) { return file_get_contents($path); }
        }
        throw new RuntimeException("Missing read-only dependency: $name $major.$minor/$file");
    }
    public function loadLibrary($name, $major, $minor) {
        return $this->libraries["$name $major.$minor"] ?? json_decode(
            $this->readLibraryFile($name, $major, $minor, 'library.json'), true, 512, JSON_THROW_ON_ERROR);
    }
    public function loadLibrarySemantics($name, $major, $minor) {
        return $this->semantics["$name $major.$minor"] ??
            $this->readLibraryFile($name, $major, $minor, 'semantics.json');
    }
    public function alterLibrarySemantics(&$semantics, $name, $major, $minor) {}
}

function installedCore($storage) {
    // Skip host storage/site initialization; keep original core methods.
    $core = (new ReflectionClass(H5PCore::class))->newInstanceWithoutConstructor();
    (new ReflectionProperty(H5PCore::class, 'h5pF'))->setValue($core, $storage);
    $core->relativePathRegExp = '/^((\.\.\/){1,2})(.*content\/)?(\d+|editor)\/(.+)$/';
    return $core;
}
function validateFixture($input, $semantics) {
    $storage = new ColumnFixtureStorage();
    $storage->libraryRoots = $input['libraryRoots'];
    $column = $input['columnLibrary'];
    $key = $column['machineName'] . ' ' . $column['majorVersion'] . '.' . $column['minorVersion'];
    $storage->libraries[$key] = $column;
    $storage->semantics[$key] = json_encode($semantics, JSON_THROW_ON_ERROR);
    $expected = [
        'H5P.AdvancedTextPapiJo' => [1, 3, 0],
        'H5PEditor.AdvancedTextPapiJoTooltip' => [1, 2, 0],
        'H5P.AccordionPapiJo' => [1, 2, 0]
    ];
    foreach ($input['candidateLibraries'] as $candidate) {
        $library = $candidate['manifest'];
        $name = $library['machineName'];
        if (!isset($expected[$name]) ||
            [$library['majorVersion'], $library['minorVersion'], $library['patchVersion']] !== $expected[$name]) {
            throw new RuntimeException('Actual candidate version mismatch: ' . $name);
        }
        unset($expected[$name]);
        // Register actual manifests/semantics verbatim; never rewrite their identity.
        $libraryKey = "$name {$library['majorVersion']}.{$library['minorVersion']}";
        $storage->libraries[$libraryKey] = $library;
        $storage->semantics[$libraryKey] = json_encode($candidate['semantics'], JSON_THROW_ON_ERROR);
    }
    if ($expected) { throw new RuntimeException('Missing actual candidate registrations'); }
    $core = installedCore($storage);
    $validator = new H5PContentValidator($storage, $core);
    $content = json_decode(json_encode($input['content'], JSON_THROW_ON_ERROR));
    $validator->validateLibrary($content, (object) ['options' => [$key]]);
    $dependencies = [];
    foreach ($validator->getDependencies() as $dependency) {
        $library = $dependency['library'];
        $dependencies[] = ['machineName' => $library['machineName'],
            'majorVersion' => $library['majorVersion'], 'minorVersion' => $library['minorVersion'],
            'type' => $dependency['type']];
    }
    return ['content' => $content, 'dependencies' => $dependencies, 'errors' => $storage->errors];
}
if ($input['operation'] === 'eligibility') {
    $core = installedCore(new ColumnFixtureStorage());
    $versions = array_map(function ($row) { return (object) $row; }, $input['versions']);
    echo json_encode((object) $core->getUpgrades((object) $input['source'], $versions), JSON_THROW_ON_ERROR);
}
elseif ($input['operation'] === 'validate') {
    echo json_encode(validateFixture($input, $input['columnSemantics']), JSON_THROW_ON_ERROR);
}
else { throw new RuntimeException('Unknown operation'); }
