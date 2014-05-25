$(function () {
  var animateHeader = "" + $(document.body).data('animate-header')

  if (animateHeader === 'true') {
    var headerShow = function () {
      var y = $(this).scrollTop();

      if (y > 10) {
        $('.navbar-fixed-top').addClass("with-shadow");
        $('.navbar-fixed-top .navbar-nav .active').removeClass("top-rounded");
        $('.header-logo').fadeIn(300);
        $('.header-description').fadeIn(300);
      } else {
        $('.navbar-fixed-top').removeClass("with-shadow");
        $('.navbar-fixed-top .navbar-nav .active').addClass("top-rounded");
        $('.header-logo').fadeOut(100);
        $('.header-description').fadeOut(100);
      }
    }

    $(document).scroll(headerShow)
    $(document).resize(headerShow)
  } else {
    $('.navbar-fixed-top').addClass("with-shadow");
    $('.navbar-fixed-top .navbar-nav .active').removeClass("top-rounded");
    $('.header-logo').show();
    $('.header-description').show();
  }

  var slagify = function (text) {
    return text.toLowerCase().replace(/[^\w ]+/g,'').replace(/ +/g,'-')
  }

  $("h2, h3").each(function () {
    var me = $(this)
    var slug = slagify(me.text())

    var html = me.data('orig-text', me.text()).append('<a id="' + slug + '" href="#" class="a-link"></a>').html()

    me.mouseenter(function () {
      me.append('<a class="link-link" href="#' + slug + '"><span class="glyphicon glyphicon-link"></span></a>')
    })

    me.mouseleave(function () {
      me.html(html)
    })
  })

  // Monkey patching! Yay! :(
  var patchBootstrap = function () {
    $.fn.scrollspy.Constructor.prototype.refresh = function () {
      var offsetMethod = this.$element[0] == window ? 'offset' : 'position'

      this.offsets = $([])
      this.targets = $([])

      var self     = this

      this.$body
          .find(this.selector)
          // just wonder why it was here in the first place
//          .filter(':visible')
          .map(function () {
            var $el   = $(this)
            var href  = $el.data('target') || $el.attr('href')
            var $href = /^#./.test(href) && $(href).parent() // taking parent because in our case it's H2

            return ($href
                && $href.length
                && $href.is(':visible')
                && [[ $href[offsetMethod]().top + (!$.isWindow(self.$scrollElement.get(0)) && self.$scrollElement.scrollTop()), href ]]) || null
          })
          .sort(function (a, b) { return a[0] - b[0] })
          .each(function () {
            self.offsets.push(this[0])
            self.targets.push(this[1])
          })
    }
  }

  $('#sidebar').each(function () {
    patchBootstrap()
    var top = $(this)
    var sidebar = $('<ul class="nav nav-stacked fixed">').appendTo(top)

    $('.main-content h2').each(function () {
      var topHeader = $(this)
      var topId = topHeader.find('.a-link').attr('id')
      var topListElem = $('<li><a href="#' + topId + '">' + topHeader.data("orig-text") + '</a></li>').appendTo(sidebar)

//      topHeader.parent().addClass('group').attr('id', topId)

      var children = $('h3', topHeader.parent()).map(function () {
        var subHeader = $(this)
        var subId = subHeader.find('.a-link').attr('id')

//        subHeader.parent().addClass('subgroup').attr('id', topId)

        return $('<li><a href="#' + subId + '">' + subHeader.data("orig-text") + '</a></li>')
      })

      if (children.length > 0) {
        var subList = $('<ul class="nav nav-stacked">').appendTo(topListElem)

        children.each(function () {
          subList.append(this)
        })
      }
    })

    $('body').scrollspy({
      target: '#' + top.attr('id'),
      offset: 85 // magic number!!! do not touch
    })
  })
})