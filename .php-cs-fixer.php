<?php

declare(strict_types=1);

$config = new PhpCsFixer\Config();
$rules = [
    'ordered_imports' => ['sort_algorithm' => 'alpha'],
    'array_indentation' => true,
    'array_syntax' => true,
    'assign_null_coalescing_to_coalesce_equal' => true,
    'binary_operator_spaces' => true,
    'braces' => [
        'allow_single_line_anonymous_class_with_empty_body' => true,
        'allow_single_line_closure' => true,
        'position_after_anonymous_constructs' => 'same',
        'position_after_control_structures' => 'same',
        'position_after_functions_and_oop_constructs' => 'same',
    ],
    'cast_spaces' => ['space' => 'none'],
    'class_reference_name_casing' => true,
    'compact_nullable_typehint' => true,
    'concat_space' => ['spacing' => 'one'],
    'constant_case' => ['case' => 'lower'],
    'control_structure_braces' => true,
    'declare_equal_normalize' => ['space' => 'none'],
    'declare_parentheses' => true,
    'declare_strict_types' => true,
    'elseif' => true,
    'full_opening_tag' => true,
    'fully_qualified_strict_types' => true,
    'function_declaration' => ['closure_function_spacing' => 'one'],
    'function_typehint_space' => true,
    'global_namespace_import' => ['import_classes' => true, 'import_constants' => true, 'import_functions' => true],
    'include' => true,
    'indentation_type' => true,
    'line_ending' => true,
    'lowercase_cast' => true,
    'lowercase_keywords' => true,
    'lowercase_static_reference' => true,
    'magic_constant_casing' => true,
    'magic_method_casing' => true,
    'native_function_casing' => true,
    'native_function_type_declaration_casing' => true,
    'new_with_braces' => true,
    'no_closing_tag' => true,
    'no_extra_blank_lines' => true,
    'no_spaces_after_function_name' => true,
    'no_spaces_around_offset' => true,
    'no_spaces_inside_parenthesis' => true,
    'no_trailing_whitespace' => true,
    'no_unused_imports' => true,
    'no_useless_else' => true,
    'no_whitespace_in_blank_line' => true,
    'return_type_declaration' => ['space_before' => 'none'],
    'short_scalar_cast' => true,
    'single_blank_line_at_eof' => true,
    'single_line_after_imports' => true,
    'single_quote' => true,
    'space_after_semicolon' => true,
    'strict_comparison' => true,
    'strict_param' => true,
    'ternary_operator_spaces' => true,
    'ternary_to_null_coalescing' => true,
    'trim_array_spaces' => true,
    'visibility_required' => true,
    'void_return' => true,
];

$finder = PhpCsFixer\Finder::create()
    ->in(__DIR__)
    ->exclude('vendor')
    ->exclude('WorkDir')
    ->exclude('TestsInit')
    ->exclude('Spec')
    // *Gen.php are gitignored build artifacts emitted by `garnet build`
    // (Foreground{Js,Css}Gen). Linting them makes cs:check flaky — green on a
    // clean tree, red right after a build.
    ->notName('*Gen.php');

return $config->setRules($rules)->setFinder($finder);
