H5P Column Papi Jo
==========

Display a list of content in a column format, each one below the next one.

Column "Papi Jo" (the H5P.ColumnPapiJo library) is a modified version which accepts the "papi Jo" versions of Dialog Cards and Drag & Drop activities.

Current release: **1.21.0** (unreleased candidate). This compatibility update allows H5P.AdvancedTextPapiJo 1.3 and H5P.AccordionPapiJo 1.2. The intentional Column 1.20 -> 1.21 minor version boundary lets H5P select a main-library content upgrade and recursively upgrade direct AdvancedTextPapiJo 1.2 children to 1.3, and nested AccordionPapiJo 1.1 children to 1.2 with their AdvancedTextPapiJo children upgraded to 1.3. All other child options and their order, runtime behavior, and H5P Core API 1.28 remain unchanged. Install compatible child libraries separately where used; AdvancedTextPapiJo 1.3 requires H5PEditor.AdvancedTextPapiJoTooltip 1.2. The private Accordion 1.1.8 recovery bridge is outside the public release chain.

Verification consumes the actual local AdvancedTextPapiJo 1.3.0, tooltip editor 1.2.0, and AccordionPapiJo 1.2.0 working-tree candidates read-only and fails if they are missing or have different versions. Installed WordPress H5P eligibility, upgrade UI, recursive engine, validator, and dependency traversal code run against in-memory fixtures, without loading WordPress or writing content/database/installed libraries. InteractiveBookPapiJo 1.17.0 adopts ColumnPapiJo 1.21 separately.

See [CHANGELOG.md](CHANGELOG.md) for release details.

## License

(The MIT License)

Copyright (c) 2015-2016 Joubel AS
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
