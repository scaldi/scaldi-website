---
layout: normal-page
animateHeader: false
title: Learn Scaldi
---

## Overview

Scaldi is dependency injection library for Scala.
It's very lightweight (without any dependencies) and provides nice Scala DSL
for binding dependencies and injecting them.

If you would Like to get a quick overview of Scaldi, I would recommend you to look at [scaldi presentation slides]({{site.link.scaldi-presentation}}) or
look at the [main page]({{"/" | prepend: site.baseurl}}) which has some examples and [feature highlights]({{"/#feature-highlights" | prepend: site.baseurl}}).
For more hands-on approach, you can check out two example projects which you can play with:

* Scaldi Play 2.4 Example ([GitHub]({{site.link.scaldi-play-example-github}}), [Typesafe activator template]({{site.link.scaldi-play-example-template}}))
* Scaldi Play 2.3 Example ([GitHub]({{site.link.scaldi-play-example-github-23}}), [Blog]({{site.link.scaldi-play-example-blog}}), [Typesafe activator template]({{site.link.scaldi-play-example-template-23}}))
* Scaldi Akka Example ([GitHub]({{site.link.scaldi-akka-example-github}}), [Blog]({{site.link.scaldi-akka-example-blog}}), [Typesafe activator template]({{site.link.scaldi-akka-example-template}}))

Activator templates also contain tutorials which show Scaldi basics and also the ways you can integrate in play/akka application.

There are 3 most important traits that you need to know, in order to make dependency injection with Scaldi:

* [Injector](#injectors) - it's a container for the bindings, that you have defined in the module.
* [Module](#module) - gives you nice syntax to create bindings with `bind` and `binding`. `Module` also extends `Injector` trait and implicit `Injector` instance always available when you are defining your bindings
* [Injectable](#inject-bindings) - the only responsibility of this trait is to provide you with `inject` function (so it just provides nice syntax for injecting dependencies). It's important to understand, that it's the only purpose of it. So it is completely stateless and knows nothing about actual bindings you have defined in the module. In order to actually find and inject dependencies, `inject` function always takes an implicit parameter of type `Injector`

Next sections will describe each of these concepts in more detail.

## Injectors

`Injector` encapsulates the binding lookup mechanism, by defining following 2 methods:

{% highlight scala %}
trait Injector {
 def getBinding(identifiers: List[Identifier]): Option[Binding]
 def getBindings(identifiers: List[Identifier]): List[Binding]

 // ...
}
{% endhighlight %}

Out of the box Scaldi comes with several different types of `Injector`s. Most of the implementations contain the actual bindings and
provide a DSL to define them (e.g. `Module`, `PropertyInjector`).
Other injectors have a more specific role and serve as a wrapper for other injectors or as an integration point between Scaldi and other libraries.
`PropertyInjector` or `PlayConfigurationInjector` are examples of such `Injector`s.
`Injector` itself is used by the `inject` function (which takes an `Injector` as an implicit argument) to inject these bindings.

On the other hand injectors also have another property - every injector can be either **mutable** or **immutable**. These two types differ in the
way [lifecycle](#injector-lifecycle) and [injector composition](#injector-composition) works. Next sections will describe it in more detail.

This section describes the set of standard injectors. There are also other, more specialised, injectors available in other parts of this documentation:

* Play-specific injectors are described in the ["Play integration" section](#play-integration)
* JSR 330 injectors are described in the ["JSR 330 Support" section](#jsr-330-support)

### Injector Lifecycle

Immutable injectors don't have any lifecycle associated with them.
Mutable injectors, from the other hand, have an initialization and shutdown lifecycle phases.
Initialization of an injector means that all non-lazy bindings are initialized.

Generally the initialization of `Injector` happens automatically as soon as you inject from it for the first time.
But you can also force it by calling `initNonLazy()` method:

{% highlight scala %}
val injector = new Module {
  bind [Server] as toNonLazy new Server
}

injector.initNonLazy()
{% endhighlight %}

In this example after the `initNonLazy` method is called, a new instance of `Server` class is created.

After injector is initialized, it is frozen, so `initNonLazy` (which is also used internally) is idempotent.

Injector lifecycle also has a shutdown phase during which all binding that defined `destroyWith` function would be destroyed.
All built-in mutable injectors are using `ShutdownHookLifecycleManager` which means that injector would be destroyed during the JVM
shutdown. But you can also force it by calling the `destroy` method:

{% highlight scala %}
val injector = new Module {
  bind [Server] to new Server destroyWith (_.terminate())
}

injector.destroy()
{% endhighlight %}

`destroy` method is also idempotent. Here is its signature:

{% highlight scala %}
def destroy(errorHandler: Throwable => Boolean = IgnoringErrorHandler): Unit
{% endhighlight %}

As you can see, it also allows you to provide an error handler that would be called if some exception occurs during the
destruction of one of the bindings. The default `IgnoringErrorHandler` just prints the stack trace and continues the shutdown procedure.

If error handler returns `true`, then an exception will not stop the shutdown procedure, otherwise it
would be stopped.

### Module

`Module` is the most common injector that you can use in most cases. It is mutable injector so it can have a lifecycle and it also provides
nice DSL for the bindings. Here is an example of it's usage:

{% highlight scala %}
val injector = new Module {
  binding identifiedBy 'host and 'google to "www.google.com"
  binding identifiedBy 'host and 'yahoo to "www.yahoo.com"
  binding identifiedBy 'host and 'github to "www.github.com"

  binding identifiedBy 'server to HttpServer("localhost", 80)
  binding identifiedBy 'server to None
  binding identifiedBy 'server to HttpServer("test", 8080)

  binding identifiedBy 'intAdder to ((a: Int, b: Int) => a + b)
  binding identifiedBy 'stringAdder to ((s1: String, s2: String) => s1 + ", " + s2)

  bind [Int] identifiedBy 'httpPort to 8081

  bind [Server] identifiedBy 'http to
    HttpServer(inject [String] ('httpHost), inject [Int] ('httpPort))

  binding identifiedBy 'database and "local" to MysqlDatabase("my_app")
}
{% endhighlight %}

### DynamicModule

`DynamicModule` is very similar to the [Module](#module) so it is also a mutable injector which provides the binding DSL. The only
difference is that it allows you bind dependencies in a function and not in the body of the subclass. Here is an example if it's usage:

{% highlight scala %}
implicit val injector = DynamicModule({ module =>
 module.bind [Int] identifiedBy 'httpPort to 8081
 module.bind [Server] identifiedBy 'http to
   HttpServer(inject [String] ('httpHost), inject [Int] ('httpPort))
 module.binding identifiedBy 'database and "local" to MysqlDatabase("my_app")
})
{% endhighlight %}

### ImmutableWrapper

`ImmutableWrapper` is very simple implementation of an injector that just delegates the binding lookup to some other injector that is provided
to it as an argument. `ImmutableWrapper` is an `ImmutableInjector`. This means that it will guard `delegate` from any lifecycle of the parent
composition, if it gets composed with another injector. It also will know nothing about the final composition,
because it is immutable, so it only able to contribute it's bindings to the composition, but not aware of it at all.

More information `ImmutableWrapper` and example of it's usage can be found in ["Implementing Scoped Bindings" section](#implementing-scoped-bindings).

### StaticModule

{% include ext.html type="danger" title="Deprecated (since v0.5)" %}
`StaticModule` is deprecated and will be removed soon. As an alternative you can use `ImmutableWrapper` injector to
define an immutability boundary in composition or create your own injector that is marked as `ImmutableInjector`
{% include cend.html %}

`StaticModule` is an immutable injector that allows you to define binding as `def`s, `val`s and `lazy val`s in the body of the subclass:

{% highlight scala %}
val module = new StaticModule {
  lazy val server = new TcpServer
  lazy val otherServer = HttpServer(inject [String] ("httpHost"), inject [Int] ('httpPort))

  def tcpHost = "tcp-test"
  def tcpPort = 1234

  val httpHost = "localhost"
  val httpPort = 4321
}
{% endhighlight %}

The resulting bindings have 2 [identifiers](#identifiers):

* String identifier which is the name of the class member (e.g. `tcpHost`, `otherServer`, etc.)
* Class identifier which is the return type of the `def` or the type of `val`

In some cases this can be pretty restrictive, because your bindings can't have more identifiers or conditions associated with them.
To provide more flexibility Scaldi also allows you to return a `BindingProvider` from the member of the class instead of a regular type.
Here is how it looks:

{% highlight scala %}
trait BindingProvider {
  def getBinding(name: String, tpe: Type): Binding
}
{% endhighlight %}

So `BindingProvider` gives you the complete control over the resulting binding.

### Property Injector

All property injectors are immutable and allow you to add binding from a property file or `Properties` class. Here is a small example showing you how
you can use it:

{% highlight scala %}
// define some properties
val props = new  Properties()

props.setProperty("host", "test-prop")
props.setProperty("port", "54321")

// main application module
class AppModule extends Module {
  bind [Server] to HttpServer(inject [String] ('host), inject [Int] ('port))

  binding identifiedBy 'host to "localhost"
  binding identifiedBy 'port to 80
}

implicit val injector = PropertiesInjector(props) :: new AppModule

Injectable.inject[Server] should equal (HttpServer("test-prop", 54321))
{% endhighlight %}

All properties are available as bindings and each property has only one string identifier and it's the name of the property.
The type of the binding is defined on the inject side. You can inject the following types:

* `String`
* `Int`
* `Long`
* `Float`
* `Double`
* `Boolean`
* `File`
* `Duration`

In addition to `PropertiesInjector` you can also use `SystemPropertiesInjector` which, as you can imagine,
allows you to inject system properties. In fact both these classes extend `RawInjector`, which allows you
easily write similar injectors. For example this is the complete implementation of `PlayConfigurationInjector`
that provides all properties from play application configuration as a bindings:

{% highlight scala %}
class PlayConfigurationInjector(app: => Application) extends RawInjector {
  def getRawValue(name: String) = app.configuration.getString(name)
}
{% endhighlight %}

### Typesafe Config Injector

[Typesafe config](https://github.com/typesafehub/config) is natively supported via `TypesafeConfigInjector`.
It is an immutable injector and allows you to add bindings from a typesafe config. It is very similar to `PropertiesInjector`
but it supports many more different property types (generally it supports all property types supported by the typesafe config itself):

* `Int`
* `List[Int]`
* `Integer`
* `List[Integer]`
* `Long`
* `List[Long]`
* `Double`
* `List[Double]`
* `Boolean`
* `List[Boolean]`
* `File`
* `List[File]`
* `Duration`
* `List[Duration]`
* `String`
* `List[String]`
* `Config`
* `List[Config]`
* `ConfigValue`
* `ConfigList`
* `ConfigObject`
* `List[ConfigObject]`

### Simple Container Injector

`SimpleContainerInjector` is very simple implementation of injector that allows you to just provide the list of bindings as an argument. It actually takes
a function `Injector => List[BindingWithLifecycle]` as an argument, so that you are able to create a list of bindings based on the final
injector composition.

### Injector Composition

Scaldi also allows you to compose injectors together with `::` or `++` operators:

{% highlight scala %}
val mainInjector = new ApplicationModule :: new DatabaseModule

// or the equivalent

val mainInjector = new ApplicationModule ++ new DatabaseModule
{% endhighlight %}

Now when you `inject` bindings from the `mainInjector` it will lookup bindings from both injectors:
`ApplicationModule` and `DatabaseModule`. **The order of the injectors is important.** So the binding lookup would
happen from left to right. This means if `ApplicationModule` and `DatabaseModule` both have a binding with the same identifiers, then one from
the `ApplicationModule` wins and would be injected. You can find more information about binding
overrides [in the correspondent section](#binding-overrides).

There is also another important aspect of the injector composition, namely mutability level. You can compose
mutable and immutable injectors together and the result can be either `ImmutableInjectorAggregation` or `MutableInjectorAggregation`,
which is an injector on itself, so it can be composed further with other injectors. This means that if you are composing
more than 2 injectors together, than they will form a tree, in which internal nodes are the the injector aggregations and
the leafs are the concrete injectors you are composing.

The composition is implemented with the type class `CanCompose`:

{% highlight scala %}
trait CanCompose[-A, -B, +R] {
  def compose(cmp1: A, cmp2: B): R
}
{% endhighlight %}

where `A` and `B` are the injectors on the left and right side of the composition. `R` is the type of the resulting injector, that combines
`A` and `B` in some way. Scaldi defines following rules for the injector composition (which you can customise by providing your own implicit instances of
the `CanCompose` type class):

* immutable injector + immutable injector = immutable injector aggregation
* mutable injector + immutable injector = mutable injector aggregation
* immutable injector + mutable injector = mutable injector aggregation

There is also another special type of the injector which is called `NilInjector`. It does not contain any bindings and
is completely ignored during the composition. It can be useful if you want to conditionally compose some injector in one expression:

{% highlight scala %}
val inj = new AModule :: (if (someCondition) new BModule else NilInjector) :: new CModule
{% endhighlight %}

Mutability in terms of injector composition means two things. First it means, that when aggregation is initialized or destroyed, then
it will also recursively initialize or destroy all of it's mutable children. So in this example:

{% highlight scala %}
val injector = new SomeImmutableInjector :: new SomeMutableInjector

injector.initNonLazy()
injector.destroy()
{% endhighlight %}

only `SomeMutableInjector` would be influenced. `SomeImmutableInjector` is not touched by the aggregation when `injector.initNonLazy()` or
`injector.destroy()` is called.

Mutability also changes the way binding lookup is done within a module. Every concrete injector like `Module` or `StaticModule`
has an implicit injector instance in scope when you are defining the bindings. That's because you are able to inject binding within
a `Module`, for example, or you are able to create new instances of classes that take an implicit instance of `Injector` as a constructor
argument. But this implicit injector instance is different in mutable and immutable injectors. It would be easier to explain it with a small example:

{% highlight scala %}
val dbModule = new Module {
  bind [Database] to new Riak(inject [String] ('host))
}

val configModule = new Module {
 bind [String] identifiedBy 'host to "localhost"
 bind [AppConfig] to new AppConfig(inject [Database])
}

val appModule = dbModule :: configModule
{% endhighlight %}

both `dbModule` and `configModule` are mutable injectors, so the implicit injector reference, that they provide within them,
is referencing the final injector composition (`appModule` in this case) and not themselves. That's the reason why you are able
to `inject [String] ('host)` within the `dbModule` and `inject [Database]` within the `configModule`. The reference to the final
composition is propagated during the initialization phase.

Immutable injectors on the other hand do not have any kind of initialisation phase, so the implicit injector, that they provide,
always references themselves. They only can contribute it's own bindings to the final composition, but they are unable to
consume bindings from it. So if `configModule` would have been an immutable injector, then it would fail because of the `inject [Database]`.

### Implementing Scoped Bindings

You may be familiar with the concept of **scope** from other DI libraries out there.
The scope of binding defines the context and the lifespan of the binding. So if we are talking about a web application,
then you can define bindings in scope of the request or a session, for instance.

Scaldi does not provide any support for the scopes out of the box. More often than not, most useful scopes are tightly coupled
with some other library that you are working with in you project, like web framework. So scaldi stays unopinionated in this
respect, which allows you to use Scaldi with any library or framework of your choice.

On the other hand, you can easily achieve very similar behaviour just by using abstractions that Scaldi provides out of the box.
Here I would like to show you a small example of how you can define a scoped bindings and isolate them from the rest of the bindings
by creating some kind of a sandbox for them.

`ImmutableWrapper` is very simple implementation of an injector that just delegates the binding lookup to some other injector that is provided
to it as an argument. The important thing to notice here is that `ImmutableWrapper` is an `ImmutableInjector`. This means that it
will guard `delegate` from any lifecycle of the parent composition, if it gets composed with another injector. It also will know nothing about
the final composition, because it is immutable, so it is only able to contribute it's bindings to the composition, but not aware of it at all.

Now lets use it:

{% highlight scala %}
class AppModule extends Module {
  bind [Database] to new Riak(inject [String] ('host), 1234)

  binding identifiedBy 'host to "localhost"
}

class UserScopedModule(user: User) extends Module {
  binding to user

  bind [ProfileService] to new DbProfileService
}

val mainModule = new AppModule

def processUser(user: User) = {
  implicit val userScopedModule = new UserScopedModule(user) :: new ImmutableWrapper(mainModule)

  val profileService = inject [ProfileService]

  profileService.deactivateProfile()

  userScopedModule.destroy()
}

processUser(User("John", "Doe"))
processUser(User("Some", "User"))
processUser(User("Another", "One"))
{% endhighlight %}

`DbProfileService` looks like this:

{% highlight scala %}
case class DbProfileService(implicit inj: Injector) extends ProfileService with Injectable  {
  val db = inject [Database]
  val user = inject [User]

  def deactivateProfile() = {
    println(s"deactivating $user")
  }
}
{% endhighlight %}

Even after you destroyed `userScopedModule`, `mainModule` still remains intact, even though both of these injectors are mutable,
because we isolated it from the `userScopedModule` with the `ImmutableWrapper`.

So as you can see, core Scaldi abstractions are flexible enough to even express concepts that are normally built-in in other libraries.

### Extending Injector

`Injector` is pretty straightforward interface to implement (we already saw several examples of it above):

{% highlight scala %}
trait Injector {
 def getBinding(identifiers: List[Identifier]): Option[Binding]
 def getBindings(identifiers: List[Identifier]): List[Binding]

 // ...
}
{% endhighlight %}

so just by implementing `getBinding` and `getBindings` methods you can create your own injectors.
You can also reuse some parts of Scaldi implementation. Here is an example of new mutable injector, which can be used
in the injector composition (which on itself means that it would be properly initialized/destroyed and that it also aware of the
final injector composition):

{% highlight scala %}
class ControllerInjector extends MutableInjectorUser
                            with InjectorWithLifecycle[ControllerInjector]
                            with ShutdownHookLifecycleManager {

  def getBindingInternal(identifiers: List[Identifier]) = {
    // your binding lookup logic
  }

  def getBindingsInternal(identifiers: List[Identifier]) = {
    // your binding lookup logic
  }

  protected def init(lifecycleManager: LifecycleManager) = {
    // your initialization logic
  }
}
{% endhighlight %}

Here is the list of some of the traits that you can mix-in in your own `Injector` implementations:

* `MutableInjectorUser` - contains implicit reference to `injector` - the final injector composition which is used by `inject`.
  Injector aggregation will set it during the initialization phase
* `InjectorWithLifecycle` - for the injectors that have lifecycle and can be initialized/destroyed
* `LifecycleManager` - all mutable injectors need to be a `LifecycleManager`
  * `ShutdownHookLifecycleManager` - implementation of the `LifecycleManager` that calls all of it's destroy callbacks during the
    JVM shutdown. The implementation is idempotent and thread-safe.
* `Injectable` - provides [injection DSL](#inject-bindings) in body of the subclasses (similar to what `Module` allows you to do, if you extend it)
* `WordBinder` - provides [binding DSL](#define-bindings) in body of the subclasses (similar to what `Module` allows you to do, if you extend it)
* `ReflectionBinder` - <span class="label label-danger">deprecated</span> gathers all `val`s, `def`s and `lazy val`s in the body of the subclasses and exposes them as a bindings (similar to what `StaticModule` allows you to do, if you extend it)

## Identifiers

The list of `Identifier`s is used to identify the binding. Unlike many other DI libraries, Scaldi does not hardcode the notion of the
identifier, but rather provides very simple interface and uses it to lookup the bindings:

{% highlight scala %}
trait Identifier {
  def sameAs(other: Identifier): Boolean
}
{% endhighlight %}

Out of the box Scaldi comes with following identifiers:

* `TypeTagIdentifier`
* `StringIdentifier`

These are the most common one - normally you associate the binding with some type and optionally with the set of string identifiers.
In this example:

{% highlight scala %}
bind [Server] identifiedBy 'real and 'http to
  HttpServer(inject [String] ('httpHost))
{% endhighlight %}

As you can see, `Symbol`s are also treated as string identifiers. In this case binding gets these 3 identifiers:

* `TypeTagIdentifier(typeOf[Server])`
* `StringIdentifier("real")`
* `StringIdentifier("server")`

and the `inject` will lookup binding with *at least* following identifiers:

* `TypeTagIdentifier(typeOf[String])`
* `StringIdentifier("httpHost")`

Scaldi also provides a type class in order to treat an existing classes like `String` or `Symbol` as identifiers:

{% highlight scala %}
trait CanBeIdentifier[T] {
  def toIdentifier(target: T): Identifier
}
{% endhighlight %}

So if you want some existing class to be treated as an identifier, then you need to provide an implicit instance of `CanBeIdentifier` in scope.

[JSR 330 support](#jsr-330-support) also defines some additional identifies, so please visit [correspondent section](#jsr-330-support) to
find more information about it.

### Required Identifiers

`Identifier` can be marked as required, which would mean, that during injection this identifier must be used in order to get this binding.
By default all built-in identifiers are not required (except `AnnotationIdentifier` which described in more detail in ["JSR 330 Support" section](#jsr-330-support)).

This can be useful if you want to make sure that particular identifier is used regardless of the binding definition order. Binding DSL
provides following 2 functions to override default required value of identifier:

* `required(<identifier>)` - makes identifier required
* `notRequired(<identifier>)` - makes identifier not required

Let's look at simple example that uses non-required identifiers (which is the default for string identifier, as mentioned earlier):

{% highlight scala %}
implicit val injector = new Module {
  bind [DB] to new NormalDb
  bind [DB] identifiedBy 'experimental to new ExperimentalDb
}

val db = inject [DB] // injected db will be ExperimentalDb
{% endhighlight %}

As you see, the `ExperimentalDb` will be injected simply because it's binding defined after `NormalDb` and will override it in this particular
case.

We can use `required` function in order to make sure, that `ExperimentalDb` injected only when client code explicitly asked for it with `'experimental`
identifier:

{% highlight scala %}
implicit val injector = new Module {
  bind [DB] to new NormalDb
  bind [DB] identifiedBy required('experimental) to new ExperimentalDb
}

val db = inject [DB] // NormalDb
val dangerousDb = inject [DB] ('experimental) // ExperimentalDb
{% endhighlight %}

## Define Bindings

Scaldi provides a binding DSL which you can you can use inside of the `Module`. Here is an example of how you can create the bindings:

{% highlight scala %}
class AppModule extends Module {
  binding identifiedBy 'host and 'google to "www.google.com"

  bind [Server] identifiedBy 'http when inProdMode to new HttpServer destroyWith (_.shutdown())
}
{% endhighlight %}

you can start to define binding with either `bind` or `binding` word. `bind` accepts one type parameter, which would be the
`TypeTagIdentifier` of the binding or in other words it is the type of the bindings. `binding` syntax assumes that the type of the binding
is the same to the bound object, so it does not take any type parameters.

You can provide addition identifiers for the binding with `identifiedBy` word or `as` and if you have more than one additional identifier, then you
can use `and`:

{% highlight scala %}
bind [Server] identifiedBy 'http and 'server to new HttpServer

// or equivalent

bind [Server] as 'http and 'server to new HttpServer
{% endhighlight %}

After this you can define a condition (only one, but you can combine several conditions with `or` or `and`) with `when` word:

{% highlight scala %}
bind [Server] when (inDevMode or inTestMode) to new HttpServer
{% endhighlight %}

If you provided several `when` conditions, then they would be combined with **and**.
You can find more information about the conditions in the [Conditions section](#conditions).

The actual value of the binding is bound with the different flavours of `to` word:

* `to` - defines a lazy binding
* `toNonLazy` - defines a non-lazy binding
* `toProvider` - defines a provider binding

all types of the bindings are described in more detail in the next sections.

You can specify a lifecycle callbacks with `initWith`/`destroyWith` words which take a function `T => Unit` as an argument, where
`T` is the type of the binding:

{% highlight scala %}
bind [Server] to new HttpServer initWith (_.init()) destroyWith (_.shutdown())
{% endhighlight %}

Identifiers, that are used to define a binding, can be marked as `required`/`notRequired` in order to influence the lookup mechanism
during the injection. More information about this feature can be found in the ["Required Identifiers" section](#required-identifiers).

### Binding Overrides

You can define several bindings for the same set of identifiers. During the binding lookup (when you injecting them) the latest
one would be used. You can also un-define the binding by defining the new binding to `None`. Here is an example:

{% highlight scala %}
bind [Server] to new HttpServer(port = 1234)
bind [Server] to None
bind [Server] to new HttpServer(port = 8080)
{% endhighlight %}

In this example when you inject the `Server`:

{% highlight scala %}
val server = inject [Server]
{% endhighlight %}

then the `server` instance will have port 8080 (and only one instance of `HttpServer` would be created).

### Lazy Binding

Lazy bindings are defined with the `to` word:

{% highlight scala %}
bind [UserService] to new UserService
{% endhighlight %}

The instance would be created **only once** as soon as as the binding is injected for the first time. All consequent
injects inject the instance that was created first time.

### Non-Lazy Binding

Non-lazy bindings are defined with the `toNonLazy` word:

{% highlight scala %}
bind [Database] toNonLazy new Riak
{% endhighlight %}

The instance would be created **only once**, but it would be created as soon as injector (in which it is defined) is initialized.
All injects get the same instance of the binding.

### Provider Binding

Provider bindings are defined with the `toProvider` word:

{% highlight scala %}
bind [Client] toProvider new HttpClient
{% endhighlight %}

A new instance is created **each time** the binding is injected. This means that each time you inject the binging, you get a new instance.

### Binding Lifecycle

The lifecycle of the binding consist of the init and destroy phases.

You can define the `T => Unit` initialization function with `initWith` word:

{% highlight scala %}
bind [Server] to new HttpServer initWith (_.init())
{% endhighlight %}

the same for the function that destroys the object. You can use `destroyWith` word:

{% highlight scala %}
bind [Server] to new HttpServer destroyWith (_.shutdown())
{% endhighlight %}

The bindings are destroyed together with the `Injector` in which they are defined. The initialization depends on
the binding type, but in general it is initialized as soon as new instance of binding is created and before it is injected.

### Generics Support

You can also bind things like functions, lists or maps. In other words Scaldi understands generic types and will correctly inject them:

{% highlight scala %}
binding identifiedBy "intAdder" to
  ((a: Int, b: Int) => a + b)

binding identifiedBy "mapping" to Map(
  "scala" -> "http://scala-lang.org",
  "play" -> "http://www.playframework.com",
  "akka" -> "http://akka.io"
)
{% endhighlight %}

Here is an example how you can inject them:

{% highlight scala %}
val intAdder = inject [(Int, Int) => Int]
val mapping = inject [Map[String, String]]
{% endhighlight %}

### Custom Bindings

When you are creating you own `Injector`s, you also have opportunity to create your own types of bindings by implementing one of two traits:

* `Binding` - meant to be maintained by immutable injectors
* `BindingWithLifecycle` - meant to be maintained by mutable injectors

Alternatively you can use bindings that come out of the box:

* `LazyBinding`
* `NonLazyBinding`
* `ProviderBinding`

Binding also provides two properties that are very useful when you consume bindings and need to be considered when you are creating a new one:

* `isEager` - tell an injector whether this binding must be initialized during the initialization stage injector itself (an example of such binding is the [Non-Lazy Binding](#non-lazy-binding))
* `isCacheable` - tells potential users whether this binding is allowed to be cached. Lazy, non-lazy binding can be cached since they are singletons,
  provider bindings from the other hand can't be cached. Annotation binding can be both, so it will decide this based on scope. This property is used in
  [Play integration](#play-integration), for example, to decide whether controller instance is allowed to be cached.

## Inject Bindings

Scaldi provides nice DSL for the binding injection. In order to make it available, you need to either import from `Injectable`:

{% highlight scala %}
import Injectable._
{% endhighlight %}

or extend it in your class:

{% highlight scala %}
class UserService(implicit inj: Injector) extends Injectable {
  // ...
}
{% endhighlight %}

Here is an example of how you can inject a binding:

{% highlight scala %}
val db = inject [Database] (identified by 'remote is by default defaultDb)
{% endhighlight %}

All forms of inject expect and implicit instance of `Injector` to be in scope.
If you are injecting in the module definition, then it already provides one for you. If you
are injecting in you own classes, then the best approach would be to provide the implicit injector
instance as a constructor argument, as shown in the example above.

### Inject Single Binding

To inject a single binding you need to use `inject` method. It takes a type parameter, which is the type of the binding and
would treated as a `TypeTagIdentifier`. You can also provide additional biding identifiers using `identified by` and separate
identifiers with `and` word:

{% highlight scala %}
val userDb = inject [Database] (identified by 'remote and 'users)
{% endhighlight %}

you can also skip `identified by ` part and just write:

{% highlight scala %}
val userDb = inject [Database] ('remote and 'users)
{% endhighlight %}

{% include ext.html type="info" title="Explicit binding type" %}
Please make sure to always provide the type of the binding explicitly (except when you are also providing the default value).
Unfortunately compiler can't correctly infer it in most cases.
But don't worry - the application will not compile if you forgot to specify the type you want to inject.
{% include cend.html %}

### Inject Provider Function

In addition to `inject`, which injects the concrete instance of the binding, you can use `injectProvider` which will
inject the function of type `() => T`, where `T`
is the type of the binding. It can be useful if the binding itself is defined with `toProvider`, so that each time you use it, you will
get the new instance. Other use case would be conditional bindings - if you have defined a binding with the same identifiers but with different
conditions, then this function can return different instances depending on the condition you've defined.

Here is an example of how you can use it:

{% highlight scala %}
class UserService(implicit inj: Injector) extends Injectable {
  val metrics = injectProvider [MetricsReporter]

  def loginUser(user: User) = {
    metrics().incrementCounter("user.login")

    // ...
  }
}
{% endhighlight %}

### Inject Several Bindings

In some cases you need to inject all bindings that match the identifiers. You can do this by using the `injectAllOfType`

{% highlight scala %}
val databases: List[Database] = injectAllOfType [Database]
{% endhighlight %}

You can also provide additional identifiers as an vararg argument:

{% highlight scala %}
val databases: List[Database] = injectAllOfType [Database] ('user, 'cache)
{% endhighlight %}

If you don't want to specify the `TypeTagIdentifier`, then you can use `injectAll`, which just takes the list of identifiers as an argument
and has no type parameters.

### Default Values

You can also specify the default value for the binding. It would be used, if the biding is not found in the `Injector`.
Here is an example of it:

{% highlight scala %}
val db = inject [Database] (by default new Riak)
{% endhighlight %}

if you already providing some additional identifiers and would like add the default value, then you can use `is` or `and` word:

{% highlight scala %}
val db = inject [Database] (identified by 'remote is by default default new Riak)

// or equivalent

val db = inject [Database] (identified by 'remote and by default new Riak)
{% endhighlight %}

{% include ext.html type="info" title="Use defaults with caution" %}
Event though default values can be useful in some circumstances, I would recommend you to avoid them in
most cases. Scaldi provides a lot of tools to help you in this respect. For example you can extract all of your defaults in
one/several modules and then compose them with the rest of the application modules. By doing this you
will make sure, that defaults are defined only once.
{% include cend.html %}

## Constructor Injection

Scaldi supports constructor injection with `injected` macro:

{% highlight scala %}
class TokenRepo(db: Database, metrics: Metrics) extends Tokens {
  // ...
}

def tokenModule = new Module {
  bind [Tokens] to injected [TokenRepo]

  bind [Database] to new Riak
  bind [Metrics] identifiedBy 'statsd to new Statsd
}
{% endhighlight %}

`injected` will create a new instance of the `TokenRepo` class and inject all constructor arguments. Here is how the end result will look like:

{% highlight scala %}
bind [Tokens] to new TokenRepo(db = inject [Database], metrics = inject [Metrics])
{% endhighlight %}

### Multiple Argument Lists

`injected` also supports multiple argument lists:

{% highlight scala %}
class TokenRepo(db: Database, metrics: Metrics)(users: UserService)(timeout: Duration) extends Tokens {
  // ...
}

def tokenModule = new Module {
  bind [Tokens] to injected [TokenRepo]

  // ...
}
{% endhighlight %}

This produces following code:

{% highlight scala %}
bind [Tokens] to new TokenRepo(db = inject [Database], metrics = inject [Metrics])(users = inject [UserService])(timeout = inject [Duration])
{% endhighlight %}

### Overriding on Argument Level

Sometimes it's not enough to just inject based on the type. In this example we have two candidates for `timeout` and the last of them would
be injected, which is suboptimal:

{% highlight scala %}
class HttpClient(basePath: String, timeout: Duration) extends Tokens {
  // ...
}

def tokenModule = new Module {
  bind [Tokens] to injected [TokenRepo]

  binding identifiedBy 'path to "http://localhost/"

  bind [Duration] identifiedBy 'http and 'connection to 10.seconds
  bind [Duration] identifiedBy 'database and 'connection to 20.seconds
}
{% endhighlight %}

`injected` accept a list of tuples, which allows you to override the injection behaviour for some arguments.
In this case you need to override the injected argument like this:

{% highlight scala %}
bind [Tokens] to injected [TokenRepo] ('timeout -> inject [Duration] (identified by 'http))
{% endhighlight %}

The argument name can be a `Symbol` like shown in example above or a `String`. If you made a mistake and injected the wrong type or
misspelled the argument name, then application will not compile (since `injected` is a macro and will produce an error at compile time).

### Default Arguments

`injected` also respects default arguments *in the first argument list*. It will use default value if it can't find the binding to inject.
Here is a small example:

{% highlight scala %}
class TokenRepo(db: Database, timeout: Duration = 10.seconds) extends Tokens {
  // ...
}

def tokenModule = new Module {
  bind [Tokens] to injected [TokenRepo]

  bind [Database] to new Riak
}
{% endhighlight %}

`TokenRepo` will get a new instance of `Riak` for the `db` argument anf the `timeout` would be `10.seconds`.

### Constructor Injection vs Implicit Injector

Generally you can take two approaches when it comes to the injection of dependencies.

You can define all dependencies of some class as a constructor arguments. In this case you need to provide all of
them when you are instantiating the class. Here is how you can do it with Scaldi:

{% highlight scala %}
class UserService(repo: UserRepository, metrics: MetricsReporter) {
  // ...
}

class AppModule extends Module {
  binding to new UserService(
    repo = inject [UserRepository],
    metrics = inject [MetricsReporter]
  )
}
{% endhighlight %}

alternatively you can use `injected` macro which is described in the previous sections.

Another approach would be to bring the implicit injector instance in scope of class and do injection directly there:

{% highlight scala %}
class UserService(implicit inj: Injector) extends Injectable {
  val repo = inject [UserRepository]
  val metrics = inject [MetricsReporter]

  // ...
}

class AppModule extends Module {
  binding to new UserService
}
{% endhighlight %}

This approach definitely removes some of the boilerplate, but also couples UserService with Scaldi.

I think in most cases it's the matter of your personal/your teams preference which approach to take. Each of them has a trade-off
to make, but in many cases the constructor injection approach is the most clean one, even though it requires a little bit more
ceremony, so I you recommend you to use it. But every application is different, so you need to decide it for yourself,
taking you team and the nature of the project into the consideration.

## Conditions

When you are defining bindings, you can also specify a condition with `when` word:

{% highlight scala %}
bind [Database] when inProdMode to new Riak
bind [Database] when (inDevMode or inTestMode) to new InMemoryDatabase
{% endhighlight %}

This gives you a lot of flexibility in the ways you can define the bindings.

If you have several bindings that have exactly the same condition, then you can group them together in the `when` block like this:

{% highlight scala %}
when (inDevMode or inTestMode) {
  bind [Database] to new Riak
  bind [PaymentService] to new MockPaymentService
}
{% endhighlight %}

This will add the same condition to every binding in the group. If binding itself also defines a condition, then the context
condition and the binding's condition would be combined with **and**.

Out of the box Scaldi comes with `SysPropCondition` which can enable/disable binding based on the system property:

{% highlight scala %}
val inDevMode = SysPropCondition(name = "mode", value = "dev")
val inProdMode = !inDevMode
{% endhighlight %}

But you can easily convert any predicate in condition like this:

{% highlight scala %}
val inDevMode = Condition(System.getProperty("devMode") != null)
{% endhighlight %}

As you already saw, conditions can be composed with `or` and `and` operators and they also support unary `!` for negation.

Here is an example of how `inDevMode` is implemented in the play support:

{% highlight scala %}
def inDevMode(implicit inj: Injector) = {
  val mode = inject [Mode] ('playMode)

  Condition(mode == Dev)
}
{% endhighlight %}

As you can see, you can even use injected dependencies in your condition.

Conditions is a very powerful tool, which can be used in many interesting ways. But please use it with caution,
and don't introduce too many conditions in your application. Also try to keep them intuitive and simple.

## Testing

Even though Scaldi does not provide explicit testing support or test-kit of any description, the testability was kept in
mind from the ground up. If you read this documentation from the beginning, you probably already have an idea how you can
test a application that uses Scaldi to do the dependency injection.

The main feature that will help you with testing is the binding overrides. You can can override any binding so that the original
binding will never be touched/instantiated and the overriding binding would be used instead.

{% highlight scala %}
// production code

class AppModule extends Module {
  bind [Database] to new Riak
}

// testing code

def mocksModule = new Module {
  bind [Database] to new InMemoryDb
}

implicit val testModule = mocksModule :: new AppModule

val db = inject [Database]
{% endhighlight %}

Biding lookup happens from left to right, so the binding for the `mocksModule` would be first looked-up in `mocksModule`. The
`db` will get an instance of `InMemoryDb` and `Riak` would not be instantiated at all.

{% include ext.html type="info" title="Don't reuse already initialised injectors" %}
As you can see in this example, I used `def` to define `mocksModule` and I also created a fresh instance of the `AppModule`. This is
important, because they both are mutable so they have a lifecycle associated with them. If I will make and `object` from the `AppModule`
(instead of `class`), then it will not work correctly if you have more than one test that creates `testModule`, because the injector
aggregation will try to initialize it once again when `Database` is injected, which is wrong. If you want to reuse an initialised
injector, then you need guard it with an immutable injector as described in the
["Implementing Scoped Bindings" section](#implementing-scoped-bindings) (but in this case you can't override the bindings) or you can
simply create a new instance of injector as described in the example above.
{% include cend.html %}

Alternatively you can use [conditions](#conditions) to define binding that are only active during the tests, but I would discourage
you from doing this in most cases - it's always a good idea to keep your test code separated from the production code.

## Play Integration

To add a Scaldi support in the play application you need to include `scaldi-play` in the **build.sbt**:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-play" % "{{site.version.scaldi-play}}"
{% endhighlight %}

Dependency injection in Play heavily relies on `ApplicationLoader` trait. It's implementations are responsible to load and initialize
your application:

<img src="{{"/assets/img/pic.svg" | prepend: site.baseurl}}" title="ScaldiApplicationLoader">


**scaldi-play** provides `scaldi.play.ScaldiApplicationLoader` which you can use to tell Play that you want to use scaldi for
dependency injection in you application. You can do so in `conf/application.conf`:

{% highlight scala %}
play.application.loader = scaldi.play.ScaldiApplicationLoader
{% endhighlight %}

Even though play also has `play.api.inject.Module`, just like scaldi, it nothing more than a container for binding definitions, which it collects
from plugins and play core. Play itself will not instantiate or initialize these bindings - it's task for `ScaldiApplicationLoader`.
After `ScaldiApplicationLoader` got these binding definitions from play, it's able to construct the `scaldi.Injector` from it, which knows how
to initialize and wire all of the bindings from play core, plugins and your application.

In order to provide you application modules to play application, you need to add them to the list of enabled modules in the `conf/application.conf` with
`play.modules.enabled` property:

{% highlight scala %}
play.application.loader = scaldi.play.ScaldiApplicationLoader

play.modules.enabled += modules.MyModule
play.modules.enabled += modules.SomeOtherModule
{% endhighlight %}

`ScaldiApplicationLoader` understands both scaldi and play-specific modules and able to compose them in one final scaldi injection aggregation.
That is the reason why it able to not only load our scaldi modules, but also play plugins and play core bindings.

Now you can bind controllers as any other class in the Module. For example:

{% highlight scala %}
class Application(implicit inj: Injector) extends Controller with Injectable {
  val messageService = inject [MessageService]

  def index = Action {
    Ok(views.html.index(messageService.getGreetMessage("Test User")))
  }
}

class WebModule extends Module {
  binding to new Application

  bind [MessageService] to new OfficialMessageService
}
{% endhighlight %}

It's not much different from the way you are using Scaldi outside of the play application. Nice thing about it
is that you no longer need to make `Controller` a global singleton `object`, but instead it can be a plain `class`.

One important thing that you now need to do is to prefix the controller class in the **conf/routes** file with `@`.
There is an example of how you can define a route for the `Application` controller:

{% highlight scala %}
GET  /                 @controllers.Application.index
{% endhighlight %}

By doing this, you are telling Play to use Scaldi to resolve the controller instance instead of trying to use it's own
internal mechanisms for it.

Please note, that if you are using `InjectedRoutesGenerator`, then you don't need to prefix your controllers with `@` in the **conf/routes** file:

{% highlight scala %}
routesGenerator := InjectedRoutesGenerator
{% endhighlight %}

You can find a tutorial and an example play application in Scaldi Play 2.4 Example ([GitHub]({{site.link.scaldi-play-example-github}}), [Typesafe activator template]({{site.link.scaldi-play-example-template}})).

{% include ext.html type="info" title="Note for plugin developers" %}
Since plugins in Play are normal modules,  it's tempting to define them as scaldi modules. I would encourage you to avoid using scaldi-specific
modules in plugin itself. Ideally you need to provide `play.api.inject.Module` for your plugin and use JSR 330 annotations, so that users
of your plugin have choice of DI library in their own applications.
{% include cend.html %}

### Play Application Lifecycle

Since `ScaldiSupport` is now deprecated and you generally should avoid usage of `GlobalSettings`, you need to use [scaldi's own lifecycle](#injector-lifecycle) as a lifecycle
of your application. So your application starts then `Injector` is initialized.

If you need to eagerly initialize some bindings, then you can use [non-lazy bindings](#non-lazy-binding):

{% highlight scala %}
bind [Database] toNonLazy new Riak
{% endhighlight %}


If some additional code need to be executed when binding is initialized or destroyed, then I would recommend you to look at ["Binding Lifecycle" section](#binding-lifecycle):


{% highlight scala %}
bind [Server] to new HttpServer initWith (_.init()) destroyWith (_.shutdown())
{% endhighlight %}

Play itself provides a binding for `ApplicationLifecycle` class which you can inject use to add additional stop logic:

{% highlight scala %}
inject [ApplicationLifecycle] addStopHook { () =>
  // destroy something
}
{% endhighlight %}

### Play-specific Injectors

Within a Play application you can add `scaldi.play.ControllerInjector` which will create controller bindings on the fly, which means that you don't need to
create then explicitly by yourself:

{% highlight scala %}
play.application.loader = scaldi.play.ScaldiApplicationLoader

play.modules.enabled += scaldi.play.ControllerInjector
{% endhighlight %}

Controller class should meet following requirements to be available for the `ControllerInjector`:

* It should extend `play.api.mvc.Controller`
* It should have constructor that takes and implicit `Injector` as an argument

### Play-specific Bindings

Play support also makes following bindings automatically available for you to inject (as well as any other play-specific bindings, like `Routes` or `ApplicationLifecycle`):

* `Application` - the Play `Application` in which injector lives
* `Mode` - the mode of the Play `Application`
* `Configuration` - the `Configuration` of the Play `Application`

### Play-specific Conditions

Following conditions are available for you to use in the binding definition:

* `inDevMode`
* `inTestMode`
* `inProdMode`

They all use Play `Application`s mode. Here is an example of how you can use them:

{% highlight scala %}
bind [Database] when inProdMode to new Riak
bind [Database] when (inDevMode or inTestMode) to new InMemoryDatabase
{% endhighlight %}

### Injecting Play Configuration

**scaldi-play** provides integration with Play configuration (`conf/application.conf`) out of the box.
So you can, for example, define `greeting.official` property there:

{% highlight scala %}
greeting.official = Welcome
{% endhighlight %}

and then just inject it anywhere in your application

{% highlight scala %}
val officialGreeting = inject [String] (identified by "greeting.official")
{% endhighlight %}

You can also inject other primitive types like `Int` or `Boolean` and not only `String` (similar to `PropertiesInjector`).
If you would like to use `configuration` instance directly, then you need inject it like this:

{% highlight scala %}
val config = inject [Configuration]
{% endhighlight %}

### Controller Cache

`scaldi-play` caches all controllers to ensure the fast controller retrieval times. It also considers `isCacheable`
property bindings, so it will not cache controllers that are bound with `toProvider` function.

If you wish to disable caching, then you can do so with `scaldi.controller.cache` property in `conf/application.conf`:

{% highlight scala %}
scaldi.controller.cache = false
{% endhighlight %}

### Testing of Play Application

Testing support comes in form of `scaldi.play.ScaldiApplicationBuilder` and `scaldi.play.ScaldiBuilder` classes and conceptually very similar to testing support
described in [the official documentation](https://www.playframework.com/documentation/2.4.x/ScalaTestingWithGuice):

{% highlight scala %}
class TestModule extends Module {
  bind [Database] to new InMemoryDatabase
}

val application = new ScaldiApplicationBuilder().prependModule(new TestModule).build()

running(application) {
  val home =  route(FakeRequest(GET, "/")).get

  status(home) must equalTo(OK)
}
{% endhighlight %}

`ScaldiApplicationBuilder` constructor has a lot of different arguments (with reasonable defaults) to customize different parts of your application.
For example you can provide additional application modules, change configuration or even influence how configuration or modules are loaded.

Instead of using `build()` method, which return you a Play `Application`, you can also use `buildInj()` which will return `scaldi.Injector`.
This can be useful, if you would like to inject some bindings:

{% highlight scala %}
implicit val injector =
  new ScaldiApplicationBuilder().prependModule(new TestModule).buildInj()

val application = inject [Application]
val db = inject [Database]
{% endhighlight %}

Companion object of `ScaldiApplicationBuilder` also has two helper methods: `withScaldiApp` and  `withScaldiInj`.
They allow you to run test in the context of running application/injector:

{% highlight scala %}
withScaldiApp(modules = Seq(new TestModule)) {
  val home =  route(FakeRequest(GET, "/")).get

  status(home) must equalTo(OK)
}

withScaldiInj(modules = Seq(TestModule)) { implicit inj =>
  inject[Database].getUsers() should be ('empty)
}
{% endhighlight %}

Both of these allow you to provide bunch of arguments to customize a fake application, just like `ScaldiApplicationBuilder` itself.

#### Additional Configuration

Here is an example of different ways to provide additional configuration:

{% highlight scala %}
val application = new ScaldiApplicationBuilder(
      configuration = Configuration("host" -> "localhost"))
  .configure(Configuration("message" -> "Test"))
  .configure(Map("host" -> "localhost", "port" -> 123))
  .configure("width" -> 100, "height" -> 200)
  .build()
{% endhighlight %}

As you can see, `ScaldiApplicationBuilder` also has builder methods for different aspects of application.

If you wish, you can also override the configuration loading function:

{% highlight scala %}
val application = new ScaldiApplicationBuilder()
  .loadConfig(env => Configuration.load(env))
  .build()
{% endhighlight %}

#### Modules

In order to provide application modules, `ScaldiApplicationBuilder` provides a constructor argument `modules` which would prepend provided modules to the
final module composition. You can also use `prependModule(...)` and `appendModule(...)` for this. Prepended modules will have the highest priority
during the binding lookup - it is very useful for test bindings since they will override bindings from other modules. Appended modules would
be added to the end of a module composition. Please see ["Injector Composition" section](#injector-composition) for more details. Here is an example:

{% highlight scala %}
val application = new ScaldiApplicationBuilder(modules = Seq(new TestModule))
  .appendModule(new AnotherModule)
  .prependModule(new YetAnotherModule)
  .build()
{% endhighlight %}

Sometimes you want to have complete control over the module composition. This means, that you would like to create composition
from scratch and disable default module loading mechanism. You can do it with the help of `loadModules` argument:

{% highlight scala %}
val appModule = new TestModule :: new ServerModule :: new UserModule :: new ControllerInjector

val application = new ScaldiApplicationBuilder(
    modules = Seq(appModule, new EhCacheModule, new BuiltinModule),
    loadModules = (_, _) => Seq.empty)
  .build()
{% endhighlight %}

As you can see in this example, you also need to compose `BuiltinModule` of play and possibly plugin modules (like cache plugin in this case)
in order to construct complete application. `loadModules = (_, _) => Seq.empty` in this case completely disables default module loading mechanism.

#### Fake Router

In some case you need to define some fake routes in the tests, it's something you was able to do with the `FakeApplication(withRoutes = ...)` before.
**scaldi-play** provides `FakeRouterModule` for this purpose - it's just a `scaldi.Injector`, so you can add it to the module list of your test application.
Here is an example of it's usage:

{% highlight scala %}
val fakeRotes = FakeRouterModule {
  case ("GET", "/some-url") => Action {
    Results.Ok("everything is fine")
  }
}

val application = new ScaldiApplicationBuilder(modules = Seq(fakeRotes)).build()

running(TestServer(3333, application), HTMLUNIT) { browser =>
  browser.goTo("http://localhost:3333/some-url")

  browser.pageSource must contain("everything is fine")
}
{% endhighlight %}

### Play 2.3.x Support

Play 2.3.x is still actively supported. In order to use scaldi in Play 2.3.x project, you need to use different dependency:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-play-23" % "{{site.version.scaldi-play-23}}"
{% endhighlight %}

Older play versions had very limited support for dependency injection, so main integration point was `GlobalSettings` trait.
You need to mix-in `ScaldiSupport` trait in the `Global` object to be able to provide your applications's modules:

{% highlight scala %}
object Global extends GlobalSettings with ScaldiSupport {
  def applicationModule = new WebModule :: new UserModule
}
{% endhighlight %}

As you can see, you also need to implement `applicationModule` method. By doing this you tell play which Injector should be used
to lookup the controller instances. This is also a good place to compose the main injector for your Play application.

## Akka Integration

To add a Scaldi support in the akka application you need to include `scaldi-akka` in the **build.sbt**:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-akka" % "{{site.version.scaldi-akka}}"
{% endhighlight %}

The only new thing that `scaldi-akka` adds is `AkkaInjectable`, which provides 2 additional inject methods:

* `injectActorRef` - creates a new actor with the help of `ActorRef` factory which should be implicitly available in the scope.
* `injectActorProps` - injects `Props` for the `Actor`, so that you can create new `Actor`s yourself with the help of the `ActorRef` factory.

where `ActorRef` factory can be one of two things:

* `ActorContext` - it always implicitly available within an `Actor` and can be used to create a new actors in the context of current actor
* `ActorSystem`

Here is a small example of how you can use `AkkaInjectable` to inject (which actually means create in case of actors) another actor:

{% highlight scala %}
class Receptionist (implicit inj: Injector) extends Actor with AkkaInjectable {
  val userService = inject [UserService]

  val orderProcessorProps = injectActorProps [OrderProcessor]
  val priceCalculator = injectActorRef [PriceCalculator]

  def receive = {
    case PlaceOrder(userName, itemId, netAmount) =>
        val processor = context.actorOf(orderProcessorProps)
        // ...
  }
}
{% endhighlight %}

Or alternatively, if you want to create an actor somewhere else (not inside of an actor), you need to bring an implicit `ActorSystem` in the scope:

{% highlight scala %}
import scaldi.akka.AkkaInjectable._

implicit val appModule: Injector = // ...

implicit val system = inject [ActorSystem]

val receptionist = injectActorRef [Receptionist]
{% endhighlight %}

We have created some actors that are able to use `inject`. The only thing that remains now is to create a module that binds them together
with other dependencies and the `ActorSystem` itself:

{% highlight scala %}
class OrderModule extends Module {
  bind [UserService] to new SimpleUserService

  bind [ActorSystem] to ActorSystem("ScaldiExample") destroyWith (_.shutdown())

  binding toProvider new Receptionist
  binding toProvider new OrderProcessor
  binding toProvider new PriceCalculator
}
{% endhighlight %}

I would like to point out how `Actor` are bound. It is important, that you bind them with `toProvider` function.
It will make sure, that Scaldi always creates new instances of the `Actor` classes when you injecting them
with `injectActorRef` or `injectActorProps`. These two methods actually use Akka mechanisms to configure an actor
instance under-the-hood, but the actor instance creation itself is always delegated to Scaldi.
During this process, Akka requires a delegate to always create new instances of an actor, so by binding `Actor`s
with `toProvider` you are fulfilling the protocol, that Akka implies.

You can find a tutorial and an example akka application in Scaldi Akka Example ([GitHub]({{site.link.scaldi-akka-example-github}}), [Blog]({{site.link.scaldi-akka-example-blog}}), [Typesafe activator template]({{site.link.scaldi-akka-example-template}})).

### Singleton Actors

In some cases you may want to create a singleton actors - they will be created and bond once and then injected in other actors that want to work with them.

Generally I would recommend to create actors within another actors and then send references around to propagate them to all places that
want to use this actor ref, because in most cases you also need to take care of proper actor supervision hierarchy.

But If you have some singleton actors that are sitting under the system guardian's supervision then what you can do is to create another
binding that will create an actor ref for the singleton actor:

{% highlight scala %}
binding identifiedBy 'someSingletonActor to {
  implicit val system = inject [ActorSystem]

  AkkaInjectable.injectActorRef [Receptionist]
}
{% endhighlight %}

then you can just `inject` it in other actors as normal:

{% highlight scala %}
inject [ActorRef] ('someSingletonActor)
{% endhighlight %}

You can improve it a little bit by creating a custom `Identifier` for it instead of using a symbol or string.

## JSR 330 Support

{% include ext.html type="info" title="Intended for integration" %}
JSR 330 support can be very helpful for integration with other libraries and frameworks. It also useful during the migration as you move your existing
codebase to scaldi, assuming that you used another JSR 330 compatible DI library (like Google Guice). If you are starting from scratch or
don't need this kind integration, then I would recommend to avoid JSR 330 annotations and use normal [Binding DSL](#define-bindings).
{% include cend.html %}

Scaldi implements [JSR 330 (Dependency Injection for Java)](https://jcp.org/en/jsr/detail?id=330) spec. This allows you to bind
JSR 330 annotated classes and inject scaldi bindings from them. From the optional part of JSR 330 spec, only private member injection is
supported (which means that static injection is not supported).

To add JSR 330 support, you need to add one extra library dependency in your project:

{% highlight scala %}
libraryDependencies += "org.scaldi" %% "scaldi-jsr330" % "{{site.version.scaldi-jsr330}}"
{% endhighlight %}

In order to bind JSR 330 annotated class you can use `annotated` syntax when you are defining a binding (all JSR 330 support resides in the
`scaldi.jsr330` package):

{% highlight scala %}
import scaldi.jsr330._

bind [Engine] to annotated [V8Engine]
{% endhighlight %}

This will define a new `AnnotationBinding` which itself is a `BindingWithLifecycle`. If `V8Engine` has a `javax.inject.Singleton` scope annotation,
then the binding would behave like a scaldi's `LazyBinding` otherwise it will behave like `ProviderBinding`.

The only supported JSR 330 scope is a `javax.inject.Singleton` scope. Custom scope annotations are not supported and will result in `BindingException`.

JSR 330 support also provides `OnDemandAnnotationInjector` which defines JSR 330 compliant bindings on-the-fly (when they are injected).

### Qualifier Annotations

Scaldi also supports `javax.inject.Named` as well as any other custom `javax.inject.Qualifier` annotation. `javax.inject.Named` qualifier
is treated as normal `StringIdentifier`. Any other custom qualifier would become an `AnnotationIdentifier`. In order to define a
binding with `AnnotationIdentifier` you can use a `qualifier` function available in `scaldi.jsr330` package:

{% highlight scala %}
import scaldi.jsr330._

bind [Seat] identifiedBy qualifier [Drivers] to annotated [DriversSeat]
{% endhighlight %}

In some cases you need to bind and instance of `Annotation` instead of just type. This can come in handy when your `Qualifier` annotations have fields.
`annotation` function allows you to do it like this:

{% highlight scala %}
import scaldi.jsr330._

binding identifiedBy annotation(SomeQualifierImpl.of("foo")) to new SomeDep
{% endhighlight %}

In this example result `SomeQualifierImpl.of()` must return an instance of a class that implements some annotation interface.

Of course you can also use the same syntax when you are injecting them:

{% highlight scala %}
import scaldi.jsr330._

val someDep = inject [SomeDep] (identified by annotation(SomeQualifierImpl.of("foo")))
val seat = inject [Seat] (identified by qualifier[Drivers])
{% endhighlight %}

`AnnotationIdentifier` is a required by default, which means that you must use it when you are injecting the binding
(see ["Required Identifiers" section](#required-identifiers) fro more details). If you want to make a standard identifier required (like `StringIdentifier`),
you need to use `required` function with this identifier:

{% highlight scala %}
bind [Tire] identifiedBy required('spare) to annotated [SpareTire]
{% endhighlight %}
